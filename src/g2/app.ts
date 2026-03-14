import { 
  waitForEvenAppBridge, 
  EvenAppBridge, 
  TextContainerProperty, 
  TextContainerUpgrade,
  CreateStartUpPageContainer
} from '@evenrealities/even_hub_sdk';

let pollingInterval: number | null = null;
let currentPage = 0; // 0 = Live, 1 = Daily Prod, 2 = Daily Cons
let renderLive = 'Connected to Solar.web!\nWaiting for live data...';
let renderDaily = 'Connected to Solar.web!\nWaiting for daily production...';
let renderDailyCon = 'Connected to Solar.web!\nWaiting for daily consumption...';
let globalBridge: EvenAppBridge | null = null;
let globalUpdateStatus: ((s: string) => void) | null = null;

const CONTAINER_ID = 1;
const SW_BASE_URL = "https://swqapi.solarweb.com";
const DEFAULT_ACCESSKEY_ID = "FKIAB4CDA71C0763413DA942DC756742318B";
const DEFAULT_ACCESSKEY_VALUE = "67315e19-6805-479e-994d-7193ee5f6125";

export async function initEvenG2App(email: string, pass: string, updateStatus: (s: string) => void) {
  globalUpdateStatus = updateStatus;
  try {
    updateStatus('Authenticating with Solar.web...');
    const authHeaders = await loginSolarWeb(email, pass);
    
    updateStatus('Finding PV System...');
    const pvSystem = await getPvSystemInfo(authHeaders);
    if (!pvSystem) {
      throw new Error("No PV System found on this account.");
    }

    const bridge = await withTimeout(waitForEvenAppBridge(), 10000);
    updateStatus('Bridge acquired. Initializing glasses layout...');
    
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            xPosition: 0,
            yPosition: 0,
            width: 576,
            height: 288,
            borderWidth: 0,
            borderColor: 0, 
            paddingLength: 4,
            containerID: CONTAINER_ID,
            containerName: 'fronius-data',
            content: renderLive,
            isEventCapture: 1,
          })
        ]
      })
    );

    globalBridge = bridge;

    // Listen for gestures to switch pages
    let lastPageTurn = 0;
    bridge.onEvenHubEvent((event: any) => {
      console.log('EvenHubEvent received:', JSON.stringify(event));
      
      // The event typically contains a textEvent or listEvent property with an eventType
      // such as 1 (SCROLL_TOP_EVENT) or 2 (SCROLL_BOTTOM_EVENT) or their string equivalents.
      const eventType = event.textEvent?.eventType ?? event.listEvent?.eventType ?? event.sysEvent?.eventType;
      
      const evtStr = String(eventType).toUpperCase();
      const isScroll = evtStr === '1' || evtStr === '2' || evtStr.includes('SCROLL');

      if (isScroll) {
        const now = Date.now();
        if (now - lastPageTurn > 500) { // 500ms debounce
          if (evtStr === '1' || evtStr.includes('SCROLL_TOP')) {
            currentPage = (currentPage - 1 + 3) % 3; // Go back
          } else {
            currentPage = (currentPage + 1) % 3; // Go forward (SCROLL_BOTTOM or others)
          }
          updateHUD().catch(console.error);
          lastPageTurn = now;
        }
      }
    });

    if (pollingInterval) window.clearInterval(pollingInterval);
    
    await pollFronius(pvSystem.id, pvSystem.name, authHeaders, bridge, updateStatus);
    pollingInterval = window.setInterval(() => {
      pollFronius(pvSystem.id, pvSystem.name, authHeaders, bridge, updateStatus);
    }, 3500);

  } catch (error) {
    console.error('Failed to init Even G2:', error);
    throw error;
  }
}

async function loginSolarWeb(userId: string, password: string): Promise<HeadersInit> {
  const headers = {
    "Content-Type": "application/json-patch+json",
    "AccessKeyId": DEFAULT_ACCESSKEY_ID,
    "AccessKeyValue": DEFAULT_ACCESSKEY_VALUE,
    "Accept": "application/json",
  };

  const response = await fetch(`${SW_BASE_URL}/iam/jwt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, password })
  });
  
  if (!response.ok) {
    throw new Error(`Authentication failed (${response.status})`);
  }
  
  const tokenData = await response.json();
  return {
    ...headers,
    "Authorization": `Bearer ${tokenData.jwtToken}`
  };
}

async function getPvSystemInfo(authHeaders: HeadersInit): Promise<{ id: string, name: string } | null> {
  const response = await fetch(`${SW_BASE_URL}/pvsystems`, { headers: authHeaders });
  if (!response.ok) throw new Error(`PV Systems failed (${response.status})`);
  const data = await response.json();
  if (data?.pvSystems && data.pvSystems.length > 0) {
    const sys = data.pvSystems[0];
    // Default to 'Fronius Solar.web' if the name field is empty or missing
    return { id: sys.pvSystemId, name: sys.name || 'Fronius Solar.web' };
  }
  return null;
}

async function updateHUD() {
  if (!globalBridge) return;
  const content = currentPage === 0 ? renderLive : (currentPage === 1 ? renderDaily : renderDailyCon);
  
  await globalBridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: CONTAINER_ID,
    containerName: 'fronius-data',
    contentOffset: 0,
    contentLength: 1000, 
    content: content,
  }));
  
  if (globalUpdateStatus) {
    const pageName = currentPage === 0 ? 'Live' : (currentPage === 1 ? 'Prod' : 'Cons');
    globalUpdateStatus(`Updated: ${new Date().toLocaleTimeString()} (Page: ${pageName})`);
  }
}

async function pollFronius(pvSystemId: string, pvSystemName: string, authHeaders: HeadersInit, bridge: EvenAppBridge, updateStatus: (s: string) => void) {
  try {
    const url = `${SW_BASE_URL}/pvsystems/${pvSystemId}/flowdata`;
    const response = await fetch(url, { headers: authHeaders });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const resValue = await response.json();
    const channels = resValue?.data?.channels;
    
    if (!channels || !Array.isArray(channels)) {
        throw new Error("Invalid Solar.web flow channels structure.");
    }

    console.log("AVAILABLE FLOW CHANNELS:", JSON.stringify(channels, null, 2));

    // Solar.web returns channels like:
    // { channelName: 'Power', channelType: 'Power', unit: 'W', value: 1234 }
    let pvGen = 0;
    let grid = 0;
    let load = 0;
    let battSoc: number | null = null;
    let battPower: number | null = null; // PowerBattCharge: positive or negative charge/discharge

    // Solar.web returns exact channelNames we can match reliably
    for (const ch of channels) {
      const name = ch.channelName;
      if (name === 'PowerPV') pvGen = Number(ch.value) || 0;
      if (name === 'PowerFeedIn') grid = Number(ch.value) || 0;
      if (name === 'PowerLoad') load = Number(ch.value) || 0;
      if (name === 'BattSOC' && ch.value !== null) battSoc = Number(ch.value);
      if (name === 'PowerBattCharge' && ch.value !== null) battPower = Number(ch.value);
    }

    const formatPower = (watts: number) => {
      const absWatts = Math.abs(watts);
      if (absWatts >= 1000) {
        return `${(absWatts / 1000).toFixed(2)} kW`;
      }
      return `${absWatts.toFixed(0)} W`;
    };

    const pvStr = `PV Gen: ${formatPower(pvGen)}`;
    // If Grid > 0 we draw from grid (+), if < 0 we feed into grid (-)
    const gridStr = grid > 0 ? `+${formatPower(grid)}` : `-${formatPower(grid)}`;
    const loadStr = formatPower(load);

    let renderText = 
      `${pvSystemName}\n\n` + 
      `${pvStr}\n` + 
      `Load: ${loadStr}\n` + 
      `Grid: ${gridStr}\n\n`;
      
    if (battSoc !== null) {
      const socStr = `${battSoc.toFixed(0)}%`;
      if (battPower !== null) {
        // PowerBattCharge: If positive, it's discharging (Out) to the house. If negative, it's charging (In) from PV.
        // From our nighttime test, 306W is positive when house draws 300W and PV is 0. So positive == discharging.
        // User requested: Out -> '-', In -> '+'
        const discharging = battPower > 0;
        const pwrStr = formatPower(Math.abs(battPower));
        const signStr = discharging ? '-' : '+';
        renderText += `Battery: ${signStr}${pwrStr} (${socStr})\n\n`;
      } else {
        renderText += `Battery: ${socStr}\n\n`;
      }
    }
    
    renderLive = renderText;

    // Fetch Daily AggrData
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const aggrUrl = `${SW_BASE_URL}/pvsystems/${pvSystemId}/aggrdata?From=${dateStr}&To=${dateStr}`;
      const aggrRes = await fetch(aggrUrl, { headers: authHeaders });
      
      if (aggrRes.ok) {
        const aggrData = await aggrRes.json();
        const aggrChannels = aggrData?.data?.[0]?.channels || [];
        
        let prodTotal = 0;
        let selfConsEnergy = 0;
        let feedIn = 0;

        let consTotal = 0;
        let purchased = 0;

        for (const ch of aggrChannels) {
          if (ch.channelName === 'EnergyProductionTotal') prodTotal = Number(ch.value) || 0;
          if (ch.channelName === 'EnergySelfConsumptionTotal') selfConsEnergy = Number(ch.value) || 0;
          if (ch.channelName === 'EnergyFeedIn') feedIn = Number(ch.value) || 0;
          
          if (ch.channelName === 'EnergyConsumptionTotal') consTotal = Number(ch.value) || 0;
          if (ch.channelName === 'EnergyPurchased') purchased = Number(ch.value) || 0;
        }

        const selfConsRate = prodTotal > 0 ? (selfConsEnergy / prodTotal) * 100 : 0;
        
        // Self-Supplied = Total Consumption - Grid Import
        const selfSupplied = Math.max(0, consTotal - purchased);
        const selfSuffRate = consTotal > 0 ? (selfSupplied / consTotal) * 100 : 0;

        const formatEnergy = (wh: number) => {
          return `${(wh / 1000).toFixed(2)} kWh`;
        };

        renderDaily = 
          `Today's production\n\n` +
          `Production: ${formatEnergy(prodTotal)}\n` +
          `Self-Consumption rate: ${selfConsRate.toFixed(0)}%\n` +
          `Self-Consumption: ${formatEnergy(selfConsEnergy)}\n` +
          `Grid Feed-In: ${formatEnergy(feedIn)}\n`;

        renderDailyCon = 
          `Today's consumption\n\n` +
          `Consumption: ${formatEnergy(consTotal)}\n` +
          `Self-Sufficiency: ${selfSuffRate.toFixed(0)}%\n` +
          `Self-Supplied: ${formatEnergy(selfSupplied)}\n` +
          `Grid Import: ${formatEnergy(purchased)}\n`;
      }
    } catch (e) {
      console.error("Failed to fetch daily aggrdata", e);
    }
    
    await updateHUD();
    
  } catch (err: any) {
    console.error('Solar.web Poll Error:', err);
    updateStatus('Error polling Solar.web: ' + err.message);
    
    bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: CONTAINER_ID,
      containerName: 'fronius-data',
      contentOffset: 0,
      contentLength: 1000, 
      content: `Solar.web API Error!\n${err.message}`,
    })).catch(console.error);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
}

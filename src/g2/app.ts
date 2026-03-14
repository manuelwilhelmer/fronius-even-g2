import { 
  waitForEvenAppBridge, 
  EvenAppBridge, 
  TextContainerProperty, 
  TextContainerUpgrade,
  CreateStartUpPageContainer
} from '@evenrealities/even_hub_sdk';

let pollingInterval: number | null = null;
const CONTAINER_ID = 1;
const SW_BASE_URL = "https://swqapi.solarweb.com";
const DEFAULT_ACCESSKEY_ID = "FKIAB4CDA71C0763413DA942DC756742318B";
const DEFAULT_ACCESSKEY_VALUE = "67315e19-6805-479e-994d-7193ee5f6125";

export async function initEvenG2App(email: string, pass: string, updateStatus: (s: string) => void) {
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
            content: 'Connected to Solar.web!\nWaiting for data...',
            isEventCapture: 1,
          })
        ]
      })
    );

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
    
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: CONTAINER_ID,
      containerName: 'fronius-data',
      contentOffset: 0,
      contentLength: 1000, 
      content: renderText,
    }));
      
    updateStatus(`Last updated: ${new Date().toLocaleTimeString()}`);
    
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

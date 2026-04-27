import { 
  waitForEvenAppBridge, 
  EvenAppBridge, 
  TextContainerProperty, 
  TextContainerUpgrade,
  CreateStartUpPageContainer
} from '@evenrealities/even_hub_sdk';

let pollingInterval: number | null = null;
let currentPage = 0; // 0 = Live, 1 = Daily Prod, 2 = Daily Cons, 3 = Monthly Prod, 4 = Monthly Cons
let currentMonthOffset = 0; // 0 = Current month, 1 = Last month, etc. (up to 11)
let isMonthMenuOpen = false;
let menuMonthOffset = 0;
let renderLive = 'Connected to Solar.web!\nWaiting for live data...';
let renderDaily = 'Connected to Solar.web!\nWaiting for daily production...';
let renderDailyCon = 'Connected to Solar.web!\nWaiting for daily consumption...';
let renderMonthly = 'Connected to Solar.web!\nWaiting for monthly production...';
let renderMonthlyCon = 'Connected to Solar.web!\nWaiting for monthly consumption...';
let globalBridge: EvenAppBridge | null = null;
let globalUpdateStatus: ((s: string) => void) | null = null;

const CONTAINER_ID = 1;
const SW_BASE_URL = "https://swqapi.solarweb.com";
const DEFAULT_ACCESSKEY_ID = "FKIAB4CDA71C0763413DA942DC756742318B";
const DEFAULT_ACCESSKEY_VALUE = "67315e19-6805-479e-994d-7193ee5f6125";

let isStartUpPageCreated = false;

export async function showInitialMessage() {
  if (isStartUpPageCreated) return;
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), 10000);
    globalBridge = bridge;
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
            content: 'Fronius started.\nPlease continue on phone.',
            isEventCapture: 1,
          })
        ]
      })
    );
    isStartUpPageCreated = true;
  } catch (error) {
    console.error('Failed to show initial message:', error);
  }
}

export async function initEvenG2App(email: string, pass: string, updateStatus: (s: string) => void) {
  globalUpdateStatus = updateStatus;
  try {
    const bridge = await withTimeout(waitForEvenAppBridge(), 10000);
    globalBridge = bridge;

    updateStatus('Bridge acquired. Initializing glasses layout...');
    
    if (!isStartUpPageCreated) {
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
              content: 'Connecting to Solar.web...',
              isEventCapture: 1,
            })
          ]
        })
      );
      isStartUpPageCreated = true;
    } else {
      await bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: CONTAINER_ID,
        containerName: 'fronius-data',
        contentOffset: 0,
        contentLength: 1000, 
        content: 'Connecting to Solar.web...',
      }));
    }

    updateStatus('Authenticating with Solar.web...');
    const authHeaders = await loginSolarWeb(email, pass);
    
    updateStatus('Finding PV System...');
    const pvSystem = await getPvSystemInfo(authHeaders);
    if (!pvSystem) {
      throw new Error("No PV System found on this account.");
    }

    // Listen for gestures to switch pages
    let lastPageTurn = 0;
    bridge.onEvenHubEvent((event: any) => {
      console.log('EvenHubEvent received:', JSON.stringify(event));
      
      const eventType = event.textEvent?.eventType ?? event.listEvent?.eventType ?? event.sysEvent?.eventType;
      const evtStr = String(eventType).toUpperCase();
      
      const isScroll = evtStr === '1' || evtStr === '2' || evtStr.includes('SCROLL');
      const isDoubleTap = evtStr === '3' || evtStr.includes('DOUBLE_CLICK');
      const isSingleTap = evtStr === '0' || evtStr === 'UNDEFINED' || (evtStr.includes('CLICK') && !evtStr.includes('DOUBLE'));

      const now = Date.now();

      if (isScroll && now - lastPageTurn > 500) { // 500ms debounce
        const isUp = evtStr === '1' || evtStr.includes('SCROLL_TOP');
        
        if ((currentPage === 3 || currentPage === 4) && isMonthMenuOpen) {
           // We are in the popup menu - scroll through months
           if (isUp) {
              menuMonthOffset = Math.max(0, menuMonthOffset - 1);
           } else {
              menuMonthOffset = Math.min(11, menuMonthOffset + 1);
           }
           updateHUD().catch(console.error);
        } else {
           // Normal Page navigation
           if (isUp) {
             currentPage = (currentPage - 1 + 5) % 5; // Go back
           } else {
             currentPage = (currentPage + 1) % 5; // Go forward
           }
           updateHUD().catch(console.error);
        }
        lastPageTurn = now;
      }
      
      if (isSingleTap && now - lastPageTurn > 500) {
        if (currentPage === 3 || currentPage === 4) {
          if (!isMonthMenuOpen) {
             // Open the menu
             isMonthMenuOpen = true;
             menuMonthOffset = currentMonthOffset;
             updateHUD().catch(console.error);
          } else {
             // Confirm selection and close menu
             isMonthMenuOpen = false;
             currentMonthOffset = menuMonthOffset;
             updateHUD().catch(console.error);
             
             // Force an immediate API fetch rather than wait for the 3.5s interval
             if (globalBridge && globalUpdateStatus && pvSystem) {
               pollFronius(pvSystem.id, pvSystem.name, authHeaders, globalBridge, globalUpdateStatus).catch(console.error);
             }
          }
        }
        lastPageTurn = now;
      }
      
      if (isDoubleTap && now - lastPageTurn > 500) {
        if (currentPage === 0) {
          if (globalBridge) {
             globalBridge.shutDownPageContainer(1).catch(console.error);
          }
        }
        lastPageTurn = now;
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
  let content = renderLive;

  if (currentPage === 1) content = renderDaily;
  if (currentPage === 2) content = renderDailyCon;
  if (currentPage === 3 || currentPage === 4) {
     if (isMonthMenuOpen) {
       // Generate the text menu instead of the data
       const today = new Date();
       let menuStr = "Select month (Scroll, then Single-Tap)\n\n";
       
       // Show 2 months before and 2 after the cursor, clamped to [0..11] range
       const startIdx = Math.max(0, menuMonthOffset - 2);
       const endIdx = Math.min(11, startIdx + 4); // Always try to show ~5 items
       
       for(let i = startIdx; i <= endIdx; i++) {
         const mDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
         const mName = mDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
         if (i === menuMonthOffset) {
            menuStr += ` [▶] ${mName}\n`;
         } else {
            menuStr += `     ${mName}\n`;
         }
       }
       content = menuStr;
     } else {
       content = currentPage === 3 ? renderMonthly : renderMonthlyCon;
     }
  }
  
  await globalBridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: CONTAINER_ID,
    containerName: 'fronius-data',
    contentOffset: 0,
    contentLength: 1000, 
    content: content,
  }));
  
  if (globalUpdateStatus) {
    const pageName = ['Live', 'Prod', 'Cons', 'M-Prod', 'M-Cons'][currentPage];
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
    // Solar.web returns exact channelNames we can match reliably
    let pvGen = 0;
    let grid = 0;
    let load = 0;
    let battSoc: number | null = null;
    let battPower: number | null = null; // PowerBattCharge: positive or negative charge/discharge
    let battEVC: number | null = null; // PowerEVCTotal

    for (const ch of channels) {
      const name = ch.channelName;
      if (name === 'PowerPV') pvGen = Number(ch.value) || 0;
      if (name === 'PowerFeedIn') grid = Number(ch.value) || 0;
      if (name === 'PowerLoad') load = Number(ch.value) || 0;
      if (name === 'PowerEVCTotal' && ch.value !== null) battEVC = Number(ch.value);
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
      `Grid: ${gridStr}\n`;
      
    if (battEVC !== null && battEVC > 0) {
      renderText += `Wattpilot: ${formatPower(battEVC)}\n`;
    }
    
    // add an extra line break before battery or at the end of grid/wattpilot
    renderText += `\n`;

    if (battSoc !== null) {
      const socStr = `${battSoc.toFixed(0)}%`;
      if (battPower !== null) {
        // PowerBattCharge: If positive, it's discharging (Out) to the house. If negative, it's charging (In) from PV.
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
    
    // Fetch Monthly AggrData
    try {
      const today = new Date();
      // Calculate target month based on offset
      const targetDate = new Date(today.getFullYear(), today.getMonth() - currentMonthOffset, 1);
      const mYear = targetDate.getFullYear();
      const mMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
      
      // Get the last day of that month
      const lastDayDate = new Date(mYear, targetDate.getMonth() + 1, 0);
      const mDayLast = String(lastDayDate.getDate()).padStart(2, '0');

      const mFrom = `${mYear}-${mMonth}-01`;
      const mTo = `${mYear}-${mMonth}-${mDayLast}`;

      const aggrUrlMonth = `${SW_BASE_URL}/pvsystems/${pvSystemId}/aggrdata?From=${mFrom}&To=${mTo}`;
      const aggrResMonth = await fetch(aggrUrlMonth, { headers: authHeaders });
      
      if (aggrResMonth.ok) {
        const aggrData = await aggrResMonth.json();
        
        let mProdTotal = 0;
        let mSelfConsEnergy = 0;
        let mFeedIn = 0;

        let mConsTotal = 0;
        let mPurchased = 0;

        if (aggrData?.data && Array.isArray(aggrData.data)) {
          for (const dayData of aggrData.data) {
            const aggrChannels = dayData.channels || [];
            for (const ch of aggrChannels) {
              if (ch.channelName === 'EnergyProductionTotal') mProdTotal += Number(ch.value) || 0;
              if (ch.channelName === 'EnergySelfConsumptionTotal') mSelfConsEnergy += Number(ch.value) || 0;
              if (ch.channelName === 'EnergyFeedIn') mFeedIn += Number(ch.value) || 0;
              
              if (ch.channelName === 'EnergyConsumptionTotal') mConsTotal += Number(ch.value) || 0;
              if (ch.channelName === 'EnergyPurchased') mPurchased += Number(ch.value) || 0;
            }
          }
        }

        const mSelfConsRate = mProdTotal > 0 ? (mSelfConsEnergy / mProdTotal) * 100 : 0;
        
        // Self-Supplied = Total Consumption - Grid Import
        const mSelfSupplied = Math.max(0, mConsTotal - mPurchased);
        const mSelfSuffRate = mConsTotal > 0 ? (mSelfSupplied / mConsTotal) * 100 : 0;

        const formatEnergy = (wh: number) => {
          return `${(wh / 1000).toFixed(2)} kWh`;
        };
        
        const monthName = targetDate.toLocaleString('en-US', { month: 'long' });

        renderMonthly = 
          `${monthName} production\n\n` +
          `Production: ${formatEnergy(mProdTotal)}\n` +
          `Self-Consumption rate: ${mSelfConsRate.toFixed(0)}%\n` +
          `Self-Consumption: ${formatEnergy(mSelfConsEnergy)}\n` +
          `Grid Feed-In: ${formatEnergy(mFeedIn)}\n`;

        renderMonthlyCon = 
          `${monthName} consumption\n\n` +
          `Consumption: ${formatEnergy(mConsTotal)}\n` +
          `Self-Sufficiency: ${mSelfSuffRate.toFixed(0)}%\n` +
          `Self-Supplied: ${formatEnergy(mSelfSupplied)}\n` +
          `Grid Import: ${formatEnergy(mPurchased)}\n`;
      }
    } catch (e) {
      console.error("Failed to fetch monthly aggrdata", e);
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

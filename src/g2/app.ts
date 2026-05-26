import { 
  waitForEvenAppBridge, 
  EvenAppBridge, 
  TextContainerProperty, 
  TextContainerUpgrade,
  CreateStartUpPageContainer
} from '@evenrealities/even_hub_sdk';

let pollingInterval: number | null = null;
let currentPage = 0;
let currentMonthOffset = 0;
let isMonthMenuOpen = false;
let menuMonthOffset = 0;
let renderLive = 'Connected to Solar.web!\nWaiting for live data...';
let renderDaily = 'Connected to Solar.web!\nWaiting for daily production...';
let renderDailyCon = 'Connected to Solar.web!\nWaiting for daily consumption...';
let renderMonthly = 'Connected to Solar.web!\nWaiting for monthly production...';
let renderMonthlyCon = 'Connected to Solar.web!\nWaiting for monthly consumption...';
let globalBridge: EvenAppBridge | null = null;
let globalUpdateStatus: ((s: string) => void) | null = null;
let isConnecting = false;
let eventListenerRegistered = false;
let lastEventTime = 0; // module-level since handler is registered only once

const CONTAINER_ID = 1;
const SW_BASE_URL = "https://fronius-cors-proxy.manuel-proxy-6960.workers.dev"; // Cloudflare CORS Proxy
const DEFAULT_ACCESSKEY_ID = "FKIAB4CDA71C0763413DA942DC756742318B";
const DEFAULT_ACCESSKEY_VALUE = "67315e19-6805-479e-994d-7193ee5f6125";

// Retry wrapper: calls waitForEvenAppBridge() up to maxAttempts times.
// Each retry waits delayMs before trying again. This handles the SDK's internal
// promise caching — after a failed attempt the SDK may need a moment to reset.
async function acquireBridgeWithRetry(maxAttempts = 3, delayMs = 2000): Promise<EvenAppBridge> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const bridge = await waitForEvenAppBridge();
      return bridge;
    } catch (err) {
      lastError = err;
      console.warn(`Bridge attempt ${attempt}/${maxAttempts} failed:`, err);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

// Track whether the startup container has already been created.
// createStartUpPageContainer must only be called once per session.
let startupScreenRendered = false;

/**
 * Call this immediately when the app mounts (before any login/auth).
 * It acquires the bridge and renders the mandatory OS startup screen on the
 * glasses right away — satisfying the Even Hub review requirement that the
 * glasses must display something as soon as the app process starts.
 */
export async function renderStartupScreen(): Promise<void> {
  if (startupScreenRendered) return;
  try {
    // Give bridge time to be ready after a restart
    const bridge = await acquireBridgeWithRetry(3, 2000);

    // Always start with "Open phone app to continue" — clear and unambiguous.
    // If credentials are saved, the text will switch to "Connecting..." automatically.
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
            content: 'Fronius Solar.web\nOpen phone app to continue.',
            isEventCapture: 1,
          })
        ]
      })
    );
    startupScreenRendered = true;
    console.log('Startup screen rendered on glasses.');

    const updateGlasses = async (text: string) => {
      try {
        await bridge.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: CONTAINER_ID,
            containerName: 'fronius-data',
            content: text,
          })
        );
      } catch (_) {}
    };

    // Load credentials async — bridge KV may need a moment after restart.
    // Try up to 3 times with a 2s pause between attempts.
    const loadCredentialsFromBridge = async (): Promise<{email: string, pass: string}> => {
      for (let i = 0; i < 3; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 2000));
        let email = '';
        let pass = '';
        try {
          if (typeof bridge.getLocalStorage === 'function') {
            const bEmail = await bridge.getLocalStorage('solarweb_email');
            const bPass  = await bridge.getLocalStorage('solarweb_password');
            if (bEmail) email = bEmail;
            if (bPass)  pass  = bPass;
          }
        } catch (_) {}
        // Fallback to browser localStorage
        if (!email) email = localStorage.getItem('solarweb_email') || '';
        if (!pass)  pass  = localStorage.getItem('solarweb_password') || '';
        if (email && pass) {
          localStorage.setItem('solarweb_email', email);
          localStorage.setItem('solarweb_password', pass);
          return { email, pass };
        }
      }
      return { email: '', pass: '' };
    };

    const { email: savedEmail, pass: savedPassword } = await loadCredentialsFromBridge();
    const hasCredentials = !!savedEmail && !!savedPassword;

    if (!hasCredentials) {
      // No credentials — keep "Open phone app to continue" as-is
      return;
    }

    // Credentials found — auto-connect with infinite retry loop
    const autoConnectLoop = async () => {
      let attempt = 0;
      while (true) {
        attempt++;
        console.log(`[auto-connect] attempt ${attempt}`);
        await updateGlasses('Fronius Solar.web\nConnecting...');
        try {
          await initEvenG2App(savedEmail, savedPassword, (status) => {
            console.log('[auto-connect]', status);
            globalUpdateStatus?.(status);
          });
          console.log('[auto-connect] connected successfully.');
          return;
        } catch (err) {
          console.warn(`[auto-connect] attempt ${attempt} failed:`, err);
          await updateGlasses('Fronius Solar.web\nOpen phone app to continue.');
          await new Promise(r => setTimeout(r, 30000));
        }
      }
    };

    autoConnectLoop(); // fire-and-forget
  } catch (e) {
    console.log('Startup screen skipped (bridge not available):', e);
  }
}


export async function saveCredentials(email: string, pass: string): Promise<void> {
  // Save to browser localStorage
  localStorage.setItem('solarweb_email', email);
  localStorage.setItem('solarweb_password', pass);
  // Also save to the Even bridge's persistent KV store (survives WebView restarts)
  try {
    const bridge = await acquireBridgeWithRetry();
    if (typeof bridge.setLocalStorage === 'function') {
      await bridge.setLocalStorage('solarweb_email', email);
      await bridge.setLocalStorage('solarweb_password', pass);
    }
  } catch (err) {
    console.warn("Could not save to bridge storage:", err);
  }
}

export async function loadCredentials(): Promise<{email: string, pass: string}> {
  // Start with browser localStorage as fallback
  let email = localStorage.getItem('solarweb_email') || '';
  let pass = localStorage.getItem('solarweb_password') || '';
  // Try to load from the Even bridge's persistent key-value store (preferred)
  try {
    const bridge = await acquireBridgeWithRetry();
    if (typeof bridge.getLocalStorage === 'function') {
      const bEmail = await bridge.getLocalStorage('solarweb_email');
      const bPass = await bridge.getLocalStorage('solarweb_password');
      if (bEmail) email = bEmail;
      if (bPass) pass = bPass;
      // Mirror back to browser localStorage for consistency
      if (email) localStorage.setItem('solarweb_email', email);
      if (pass) localStorage.setItem('solarweb_password', pass);
    }
  } catch (err) {
    console.warn("Could not load from bridge storage:", err);
  }
  return { email, pass };
}

export async function initEvenG2App(
  email: string,
  pass: string,
  updateStatus: (s: string) => void,
  existingBridge?: EvenAppBridge
) {
  // Prevent concurrent calls — fixes call stack overflow from multiple event handler registrations
  if (isConnecting) {
    console.warn('[initEvenG2App] already connecting, skipping duplicate call');
    return;
  }
  isConnecting = true;
  globalUpdateStatus = updateStatus;
  try {
    updateStatus('Connecting to Even Hub Bridge...');
    const bridge = existingBridge ?? await acquireBridgeWithRetry(3, 2000);
    globalBridge = bridge;

    updateStatus('Bridge acquired. Initializing glasses layout...');

    // Only create the startup container if renderStartupScreen() hasn't done it yet.
    // When called from renderStartupScreen the container already exists.
    // When called directly (e.g. from App.tsx with no prior startup screen),
    // show "Connecting..." — NEVER "please continue on phone" here.
    if (!startupScreenRendered) {
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
              content: 'Fronius Solar.web\nConnecting...',
              isEventCapture: 1,
            })
          ]
        })
      );
      startupScreenRendered = true;
    }

    updateStatus('Authenticating with Solar.web...');
    const authHeaders = await loginSolarWeb(email, pass);
    
    updateStatus('Finding PV System...');
    const pvSystem = await getPvSystemInfo(authHeaders);
    if (!pvSystem) {
      throw new Error("No PV System found on this account.");
    }

    // Listen for gestures — register only ONCE per session to avoid handler buildup
    if (!eventListenerRegistered) {
      eventListenerRegistered = true;
      bridge.onEvenHubEvent((event: any) => {
        console.log('EvenHubEvent received:', JSON.stringify(event));
      
        const eventType = event.textEvent?.eventType ?? event.listEvent?.eventType ?? event.sysEvent?.eventType;
        const evtStr = String(eventType).toUpperCase();

      // --- Lifecycle events ---
      if (evtStr.includes('FOREGROUND_EXIT') || evtStr === '5') {
        // Pause polling when app goes to background
        if (pollingInterval) {
          window.clearInterval(pollingInterval);
          pollingInterval = null;
        }
        return;
      }
      if (evtStr.includes('FOREGROUND_ENTER') || evtStr === '4') {
        // Resume polling when app returns to foreground
        if (!pollingInterval && pvSystem) {
          pollFronius(pvSystem.id, pvSystem.name, authHeaders, bridge, updateStatus).catch(console.error);
          pollingInterval = window.setInterval(() => {
            pollFronius(pvSystem.id, pvSystem.name, authHeaders, bridge, updateStatus);
          }, 3500);
        }
        return;
      }
      if (evtStr.includes('ABNORMAL_EXIT') || evtStr === '6' || evtStr.includes('SYSTEM_EXIT') || evtStr === '7') {
        // Cleanup on unexpected/system exit
        if (pollingInterval) {
          window.clearInterval(pollingInterval);
          pollingInterval = null;
        }
        globalBridge = null;
        return;
      }

      const now = Date.now();
      const DEBOUNCE_MS = 500;

      const isScroll = evtStr === '1' || evtStr === '2' || evtStr.includes('SCROLL');
      // Single tap: eventType 0 (normalized to undefined sometimes by SDK), or CLICK_EVENT
      const isSingleTap = eventType === 0 || eventType === undefined ||
                          evtStr === '0' || evtStr === 'CLICK_EVENT' || evtStr === 'UNDEFINED';
      // Double tap: eventType 3, or DOUBLE_CLICK_EVENT
      const isDoubleTap = evtStr === '3' || evtStr.includes('DOUBLE_CLICK');

      // --- Double-tap: system exit dialog on any page (required by review) ---
      if (isDoubleTap && now - lastEventTime > DEBOUNCE_MS) {
        lastEventTime = now;
        bridge.shutDownPageContainer(1).catch(console.error);
        return;
      }

      // --- Scroll: page navigation or month menu scroll ---
      if (isScroll && now - lastEventTime > DEBOUNCE_MS) {
        const isUp = evtStr === '1' || evtStr.includes('SCROLL_TOP');
        
        if ((currentPage === 3 || currentPage === 4) && isMonthMenuOpen) {
          // Scroll through months in the popup menu
          if (isUp) {
            menuMonthOffset = Math.max(0, menuMonthOffset - 1);
          } else {
            menuMonthOffset = Math.min(11, menuMonthOffset + 1);
          }
          updateHUD().catch(console.error);
        } else {
          // Normal page navigation
          if (isUp) {
            currentPage = (currentPage - 1 + 5) % 5;
          } else {
            currentPage = (currentPage + 1) % 5;
          }
          updateHUD().catch(console.error);
        }
        lastEventTime = now;
      }

      // --- Single tap on month pages: open/confirm month menu ---
      if (isSingleTap && (currentPage === 3 || currentPage === 4) && now - lastEventTime > DEBOUNCE_MS) {
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
          // Force immediate API fetch
          if (globalBridge && globalUpdateStatus && pvSystem) {
            pollFronius(pvSystem.id, pvSystem.name, authHeaders, globalBridge, globalUpdateStatus).catch(console.error);
          }
        }
        lastEventTime = now;
        }
      }); // end bridge.onEvenHubEvent
    } // end if (!eventListenerRegistered)

    if (pollingInterval) window.clearInterval(pollingInterval);
    
    await pollFronius(pvSystem.id, pvSystem.name, authHeaders, bridge, updateStatus);
    pollingInterval = window.setInterval(() => {
      pollFronius(pvSystem.id, pvSystem.name, authHeaders, bridge, updateStatus);
    }, 3500);

  } catch (error) {
    console.error('Failed to init Even G2:', error);
    throw error;
  } finally {
    isConnecting = false;
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
       let menuStr = "Select month (Scroll, then Tap)\n\n";
       
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


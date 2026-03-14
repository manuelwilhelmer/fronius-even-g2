import { 
  waitForEvenAppBridge, 
  EvenAppBridge, 
  TextContainerProperty, 
  TextContainerUpgrade,
  CreateStartUpPageContainer
} from '@evenrealities/even_hub_sdk';

// Let's create a polling interval reference so we can clear it if needed
let pollingInterval: number | null = null;
const CONTAINER_ID = 1;

export async function initEvenG2App(inverterIp: string, updateStatus: (s: string) => void) {
  try {
    // We wait 10 seconds max for the Bridge as per the usual timeout wrap
    const bridge = await withTimeout(waitForEvenAppBridge(), 10000);
    
    updateStatus('Bridge acquired. Initializing glasses layout...');
    
    // Build initial empty layout
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
            borderColor: 0, // black/no color
            paddingLength: 4,
            containerID: CONTAINER_ID,
            containerName: 'fronius-data',
            content: 'Connecting to Fronius PV...\nWaiting for data...',
            isEventCapture: 1,
          })
        ]
      })
    );

    // Initial setup complete, now let's set up polling to the local inverter API
    if (pollingInterval) clearInterval(pollingInterval);
    
    // Start polling immediately and then every 3 seconds
    await pollFronius(inverterIp, bridge, updateStatus);
    pollingInterval = window.setInterval(() => {
      pollFronius(inverterIp, bridge, updateStatus);
    }, 3000);

  } catch (error) {
    console.error('Failed to init Even G2:', error);
    throw error;
  }
}

async function pollFronius(ip: string, bridge: EvenAppBridge, updateStatus: (s: string) => void) {
  try {
    const url = `http://${ip}/solar_api/v1/GetPowerFlowRealtimeData.fcgi`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const site = data?.Body?.Data?.Site;
    
    if (!site) throw new Error("Invalid API response structure");

    // site.P_PV: Solar generation (null if offline)
    // site.P_Grid: + means drawing from grid, - means feeding to grid
    // site.P_Load: + means consuming
    // site.rel_Autonomy: Percentage
    
    const pvGen = site.P_PV || 0;
    const grid = site.P_Grid || 0;
    const load = site.P_Load || 0;

    const pvStr = pvGen ? `${pvGen.toFixed(0)} W` : '0 W';
    const gridStr = grid > 0 ? `Draw: +${grid.toFixed(0)} W` : `Feed: ${grid.toFixed(0)} W`;
    const loadStr = Math.abs(load).toFixed(0) + ' W';

    const renderText = 
      `Fronius Solar Power\n\n` + 
      `PV Gen : ${pvStr}\n` + 
      `Grid   : ${gridStr}\n` + 
      `Load   : ${loadStr}\n\n` + 
      `Autonomy: ${site.rel_Autonomy || 0}%`;
    
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: CONTAINER_ID,
      containerName: 'fronius-data',
      contentOffset: 0,
      contentLength: 1000, 
      content: renderText,
    }));
      
    updateStatus(`Last updated: ${new Date().toLocaleTimeString()}`);
    
  } catch (err: any) {
    console.error('Fronius Poll Error:', err);
    updateStatus('Error polling Fronius: ' + err.message);
    
    // Optionally update the glasses with an error state (ignore if it fails)
    bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: CONTAINER_ID,
      containerName: 'fronius-data',
      contentOffset: 0,
      contentLength: 1000, 
      content: `Fronius API Error!\nCheck IP: ${ip}\n${err.message}`,
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

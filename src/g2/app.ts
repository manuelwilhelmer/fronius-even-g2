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
    
    updateStatus('Finding PV System ID...');
    const pvSystemId = await getPvSystemId(authHeaders);
    if (!pvSystemId) {
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
    
    await pollFronius(pvSystemId, authHeaders, bridge, updateStatus);
    pollingInterval = window.setInterval(() => {
      pollFronius(pvSystemId, authHeaders, bridge, updateStatus);
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

async function getPvSystemId(authHeaders: HeadersInit): Promise<string | null> {
  const response = await fetch(`${SW_BASE_URL}/pvsystems`, { headers: authHeaders });
  if (!response.ok) throw new Error(`PV Systems failed (${response.status})`);
  const data = await response.json();
  if (data?.pvSystems && data.pvSystems.length > 0) {
    return data.pvSystems[0].pvSystemId;
  }
  return null;
}

async function pollFronius(pvSystemId: string, authHeaders: HeadersInit, bridge: EvenAppBridge, updateStatus: (s: string) => void) {
  try {
    const url = `${SW_BASE_URL}/pvsystems/${pvSystemId}/flowdata`;
    const response = await fetch(url, { headers: authHeaders });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const resValue = await response.json();
    const channels = resValue?.data?.channels;
    
    if (!channels || !Array.isArray(channels)) {
        throw new Error("Invalid Solar.web flow channels structure.");
    }

    // Solar.web returns channels like:
    // { channelName: 'Power', channelType: 'Power', unit: 'W', value: 1234 }
    let pvGen = 0;
    let grid = 0;
    let load = 0;
    let autonomy = 0;
    let battSoc: number | null = null;

    // Solar.web returns exact channelNames we can match reliably
    for (const ch of channels) {
      const name = ch.channelName;
      if (name === 'PowerPV') pvGen = Number(ch.value) || 0;
      if (name === 'PowerFeedIn') grid = Number(ch.value) || 0;
      if (name === 'PowerLoad') load = Number(ch.value) || 0;
      if (name === 'RateSelfSufficiency') autonomy = Number(ch.value) || 0;
      if (name === 'BattSOC' && ch.value !== null) battSoc = Number(ch.value);
    }

    const pvStr = pvGen ? `${pvGen.toFixed(0)} W` : '0 W';
    const gridStr = grid > 0 ? `Draw: +${grid.toFixed(0)} W` : `Feed: ${Math.abs(grid).toFixed(0)} W`;
    const loadStr = Math.abs(load).toFixed(0) + ' W';

    let renderText = 
      `Fronius Solar.web\n\n` + 
      `PV Gen : ${pvStr}\n` + 
      `Grid   : ${gridStr}\n` + 
      `Load   : ${loadStr}\n\n`;
      
    if (battSoc !== null) {
      renderText += `Battery: ${battSoc.toFixed(1)}%\n`;
    }
    renderText += (autonomy ? `Autonomy: ${autonomy.toFixed(0)}%` : `Online`);
    
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

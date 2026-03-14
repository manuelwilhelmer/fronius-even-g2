const SW_BASE_URL = "https://swqapi.solarweb.com";
const DEFAULT_ACCESSKEY_ID = "FKIAB4CDA71C0763413DA942DC756742318B";
const DEFAULT_ACCESSKEY_VALUE = "67315e19-6805-479e-994d-7193ee5f6125";

async function run() {
  const headers = {
    "Content-Type": "application/json-patch+json",
    "AccessKeyId": DEFAULT_ACCESSKEY_ID,
    "AccessKeyValue": DEFAULT_ACCESSKEY_VALUE,
    "Accept": "application/json",
  };

  const response = await fetch(`${SW_BASE_URL}/iam/jwt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId: "manuel.wilhelmer@icloud.com", password: "MaWifronius6@" })
  });
  const tokenData = await response.json();
  const authHeaders = { ...headers, "Authorization": `Bearer ${tokenData.jwtToken}` };

  const pvRes = await fetch(`${SW_BASE_URL}/pvsystems`, { headers: authHeaders });
  const pvData = await pvRes.json();
  const pvSystemId = pvData.pvSystems[0].pvSystemId;

  const flowRes = await fetch(`${SW_BASE_URL}/pvsystems/${pvSystemId}/flowdata`, { headers: authHeaders });
  const flowData = await flowRes.json();
  
  console.log(JSON.stringify(flowData.data.channels.map(ch => ({ name: ch.channelName, val: ch.value })), null, 2));
}

run().catch(console.error);

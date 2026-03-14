import { useState, useEffect } from 'react';
import { initEvenG2App } from './g2/app';

export default function App() {
  const [ipAddress, setIpAddress] = useState('');
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Waiting to connect...');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const savedIp = localStorage.getItem('fronius_ip');
    if (savedIp) {
      setIpAddress(savedIp);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('fronius_ip', ipAddress);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleConnect = async () => {
    if (!ipAddress) {
      setConnectionStatus('Please enter an IP address first');
      return;
    }
    
    setConnectionStatus('Connecting to Even Hub Bridge...');
    try {
      await initEvenG2App(ipAddress, setConnectionStatus);
      setIsConnected(true);
      setConnectionStatus('Connected via Bluetooth proxy to Even G2.');
    } catch (err) {
      console.error(err);
      setConnectionStatus('Failed to connect. Check bridge status or try again.');
      setIsConnected(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-8 p-6 mx-auto max-w-lg w-full bg-slate-900 border border-slate-700/50 shadow-2xl rounded-2xl backdrop-blur-sm">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Fronius Even G2
        </h1>
        <p className="text-slate-400 text-sm">Monitor your solar production directly on your smart glasses.</p>
      </div>

      <div className="w-full space-y-4 text-left">
        <label htmlFor="ip_address" className="block text-sm font-medium text-slate-300">
          Inverter IP Address
        </label>
        <input
          type="text"
          id="ip_address"
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
          placeholder="e.g. 192.168.1.150"
          className="w-full px-4 py-3 bg-slate-800/80 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
        />
        
        <div className="flex space-x-3 pt-2">
          <button
            onClick={handleSave}
            className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors focus:ring-2 focus:ring-slate-500 outline-none"
          >
            {saved ? 'Saved!' : 'Save IP'}
          </button>
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className="flex-[2] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/20 transition-all outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnected ? 'Connected' : 'Connect Glasses'}
          </button>
        </div>
      </div>

      <div className="w-full p-4 bg-slate-950 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 relative before:animate-ping before:absolute before:inset-0 before:rounded-full before:bg-emerald-500' : 'bg-slate-500'}`}></div>
          <p className="text-sm font-mono text-slate-300">
            {connectionStatus}
          </p>
        </div>
      </div>
    </div>
  );
}

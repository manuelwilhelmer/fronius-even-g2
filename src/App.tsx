import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { initEvenG2App } from './g2/app';

export default function App() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Keep translation strictly local so the initial status can translate
    setConnectionStatus(t('statusWaiting'));
  }, [t]);

  useEffect(() => {
    const savedEmail = localStorage.getItem('solarweb_email');
    const savedPassword = localStorage.getItem('solarweb_password');
    if (savedEmail) setEmail(savedEmail);
    if (savedPassword) setPassword(savedPassword);
  }, []);

  const handleSave = () => {
    localStorage.setItem('solarweb_email', email);
    localStorage.setItem('solarweb_password', password);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleConnect = async () => {
    if (!email || !password) {
      setConnectionStatus(t('statusEmpty'));
      return;
    }
    
    setConnectionStatus(t('statusConnecting'));
    try {
      await initEvenG2App(email, password, setConnectionStatus);
      setIsConnected(true);
      setConnectionStatus(t('statusConnected'));
    } catch (err) {
      console.error(err);
      setConnectionStatus(t('statusError'));
      setIsConnected(false);
    }
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[90vh] space-y-8 p-6 mx-auto max-w-lg w-full bg-white border border-gray-100 shadow-xl rounded-3xl relative">
      
      {/* Header with Logo and Language Switcher */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center">
        <div className="h-8 flex items-center">
          <svg viewBox="0 0 250 100" className="h-full w-auto">
            <ellipse cx="125" cy="50" rx="120" ry="45" fill="#e2231a" />
            <text 
              x="50%" 
              y="55%" 
              dominantBaseline="middle" 
              textAnchor="middle" 
              fill="white" 
              fontSize="44" 
              fontWeight="900" 
              fontFamily="Arial, sans-serif"
              fontStyle="italic"
              letterSpacing="-2"
            >
              Fronius
            </text>
          </svg>
        </div>
        <select 
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="text-xs font-bold uppercase text-gray-400 bg-gray-50 hover:bg-gray-100 rounded-md px-3 py-1.5 outline-none transition-colors border border-gray-100 cursor-pointer tracking-wider font-sans"
        >
          <option value="en">EN</option>
          <option value="de">DE</option>
        </select>
      </div>

      <div className="text-center space-y-1.5 mt-10">
        <h1 className="text-3xl font-sans font-bold tracking-tight text-[#e2231a] uppercase">
          {t('appTitle')}
        </h1>
        <p className="text-gray-500 text-sm max-w-sm mx-auto font-sans leading-relaxed">
          {t('subtitle')}
        </p>
      </div>

      <div className="w-full space-y-4 text-left font-sans">
        <div>
          <label htmlFor="email" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
            {t('emailLabel')}
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
          />
        </div>

        <div>
           <label htmlFor="password" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
            {t('passwordLabel')}
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 text-[8px] bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all tracking-[0.3em]"
          />
        </div>
        
        <div className="flex space-x-3 pt-4">
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-lg transition-colors outline-none text-sm"
          >
            {saved ? t('savedBtn') : t('saveBtn')}
          </button>
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className="flex-[2] py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed tracking-wide text-sm"
          >
            {isConnected ? t('connectedBtn') : t('connectBtn')}
          </button>
        </div>
      </div>

      <div className="w-full p-4 bg-gray-50/50 rounded-xl border border-gray-100 mt-4">
        <div className="flex items-center space-x-3">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
          <p className="text-xs font-medium text-gray-400 tracking-wide uppercase">
            {connectionStatus}
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell, Card, Button, Input, StatusDot, ScreenHeader, Loading } from 'even-toolkit/web';
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { initEvenG2App } from './g2/app';

export default function App() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const isAutoConnecting = useRef(false);

  useEffect(() => {
    // Keep translation strictly local so the initial status can translate
    setConnectionStatus(t('statusWaiting'));
  }, [t]);

  useEffect(() => {
    const loadSavedData = async () => {
      let savedEmail = localStorage.getItem('solarweb_email') || '';
      let savedPassword = localStorage.getItem('solarweb_password') || '';

      try {
        const bridge = await waitForEvenAppBridge();
        const bridgeEmail = await bridge.getLocalStorage('solarweb_email');
        const bridgePass = await bridge.getLocalStorage('solarweb_password');

        if (bridgeEmail) savedEmail = String(bridgeEmail);
        if (bridgePass) savedPassword = String(bridgePass);
      } catch (e) {
        console.log('Bridge not available for loading local storage', e);
      }

      if (savedEmail) setEmail(savedEmail);
      if (savedPassword) setPassword(savedPassword);

      if (savedEmail && savedPassword && !isAutoConnecting.current) {
        isAutoConnecting.current = true;
        handleConnect(savedEmail, savedPassword);
      }
    };
    
    loadSavedData();
  }, []);

  const handleSave = async () => {
    localStorage.setItem('solarweb_email', email);
    localStorage.setItem('solarweb_password', password);
    try {
      const bridge = await waitForEvenAppBridge();
      await bridge.setLocalStorage('solarweb_email', email);
      await bridge.setLocalStorage('solarweb_password', password);
    } catch (e) {
      console.log('Bridge not available for saving local storage', e);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleConnect = async (overrideEmail?: string, overridePass?: string) => {
    // Determine which credentials to use (function arguments or component state)
    const e = typeof overrideEmail === 'string' ? overrideEmail : email;
    const p = typeof overridePass === 'string' ? overridePass : password;
    
    if (!e || !p) {
      setConnectionStatus(t('statusEmpty'));
      return;
    }
    
    setIsConnecting(true);
    setConnectionStatus(t('statusConnecting'));
    try {
      // Reduced delay for faster autonomous background execution
      await new Promise(resolve => setTimeout(resolve, 500));
      await initEvenG2App(e, p, setConnectionStatus);
      setIsConnected(true);
      setConnectionStatus(t('statusConnected'));
    } catch (err) {
      console.error(err);
      setConnectionStatus(t('statusError'));
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <AppShell
      header={
        <div className="flex justify-between items-center px-4 py-2 bg-bg border-b border-divider">
          <ScreenHeader title={t('appTitle')} />
          <select 
            value={i18n.language}
            onChange={(e) => changeLanguage(e.target.value)}
            className="text-xs font-bold uppercase text-text bg-surface rounded-md px-3 py-1.5 border border-divider outline-none"
          >
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
        </div>
      }
    >
      <div className="px-4 flex flex-col gap-6 max-w-lg mx-auto w-full pt-6">
        <p className="text-text-dim text-sm -mt-2 mb-2">
          {t('subtitle')}
        </p>

        {/* Form elements */}
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-text-dim uppercase tracking-widest mb-1">
                {t('emailLabel')}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e: any) => setEmail(e?.target ? e.target.value : e)}
                placeholder={t('emailPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-dim uppercase tracking-widest mb-1">
                {t('passwordLabel')}
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e: any) => setPassword(e?.target ? e.target.value : e)}
                placeholder="••••••••"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button
                size="sm"
                variant="default"
                onClick={handleSave}
                className="flex-[1] border border-divider shadow-sm"
              >
                {saved ? t('savedBtn') : t('saveBtn')}
              </Button>
              <Button
                size="sm"
                variant="highlight"
                onClick={() => handleConnect()}
                disabled={isConnected || isConnecting}
                className="flex-[2] border border-divider shadow-sm"
              >
                {isConnected ? t('connectedBtn') : t('connectBtn')}
              </Button>
            </div>
          </div>
        </Card>

        {/* Status Area */}
        <Card>
          {isConnecting ? (
            <div className="flex justify-center py-1">
              <Loading size={24} className="text-text-dim" />
            </div>
          ) : (
            <div className="flex items-center gap-3 py-1">
              <StatusDot connected={isConnected} />
              <span className="text-sm font-medium text-text-dim uppercase tracking-wide">
                {connectionStatus}
              </span>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

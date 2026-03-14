import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// English Translations
const en = {
  translation: {
    appTitle: "FRONIUS SOLAR.WEB",
    subtitle: "Monitor your solar production from solar.web directly on your glasses.",
    emailLabel: "E-Mail",
    emailPlaceholder: "e.g. hello@example.com",
    passwordLabel: "Password",
    saveBtn: "Save Login",
    savedBtn: "Saved!",
    connectBtn: "Log In",
    connectedBtn: "Connected",
    statusWaiting: "Waiting to connect...",
    statusConnecting: "Connecting to Even Hub Bridge...",
    statusConnected: "Connected to Even G2 & Solar.web API.",
    statusError: "Failed to connect. Check bridge status or credentials.",
    statusEmpty: "Please enter an email and password first",
  }
};

// German Translations
const de = {
  translation: {
    appTitle: "FRONIUS SOLAR.WEB",
    subtitle: "Überwache deine Solarproduktion von solar.web direkt über deine Brille",
    emailLabel: "E-Mail",
    emailPlaceholder: "z.B. hallo@beispiel.de",
    passwordLabel: "Passwort",
    saveBtn: "Login speichern",
    savedBtn: "Gespeichert!",
    connectBtn: "Anmelden",
    connectedBtn: "Verbunden",
    statusWaiting: "Warte auf Verbindung...",
    statusConnecting: "Verbinde mit Even Hub Bridge...",
    statusConnected: "Mit Even G2 & Solar.web API verbunden.",
    statusError: "Verbindung fehlgeschlagen. Bitte Bridge oder Login-Daten prüfen.",
    statusEmpty: "Bitte zuerst eine E-Mail und ein Passwort eingeben.",
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en,
      de
    },
    lng: "en", // Default language
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;

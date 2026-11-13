import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { NAMESPACES, resources } from '@/locales';

import { LANGUAGE_CODES } from './languages';

// Resources are bundled JSON, so init is synchronous (initAsync: false) and the first render
// already has strings. The persisted language is applied by the root layout after hydration.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: { ks: ['ur', 'en'], default: ['en'] },
  supportedLngs: LANGUAGE_CODES,
  load: 'languageOnly',
  ns: [...NAMESPACES],
  defaultNS: 'common',
  initAsync: false,
  returnNull: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
export * from './languages';
export { useLanguage, applyLanguage } from './useLanguage';

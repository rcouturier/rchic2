/**
 * Internationalization module for RCHIC
 */
class I18n {
  constructor() {
    this.locale = localStorage.getItem('rchic-locale') || this.detectLocale();
    this.translations = {};
    this.fallback = {};
  }

  /**
   * Detect browser locale
   */
  detectLocale() {
    const browserLang = navigator.language || navigator.userLanguage;
    const lang = browserLang.split('-')[0];
    return ['fr', 'en'].includes(lang) ? lang : 'en';
  }

  /**
   * Load translations for a locale
   */
  async load(locale) {
    try {
      // Load requested locale
      const response = await fetch(`locales/${locale}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.translations = await response.json();
      this.locale = locale;
      localStorage.setItem('rchic-locale', locale);

      // Load fallback (English) if not already loaded
      if (locale !== 'en' && Object.keys(this.fallback).length === 0) {
        try {
          const fallbackResponse = await fetch('locales/en.json');
          if (fallbackResponse.ok) {
            this.fallback = await fallbackResponse.json();
          }
        } catch (e) {
          console.warn('Could not load fallback locale');
        }
      }

      this.apply();
      return true;
    } catch (e) {
      console.error(`Failed to load locale: ${locale}`, e);
      // Try fallback to English
      if (locale !== 'en') {
        return this.load('en');
      }
      return false;
    }
  }

  /**
   * Get translation for a key (dot notation: "app.title")
   */
  t(key, params = {}) {
    let value = this.getNestedValue(this.translations, key);

    // Fallback to English if not found
    if (value === undefined) {
      value = this.getNestedValue(this.fallback, key);
    }

    // Return key if still not found
    if (value === undefined) {
      console.warn(`Missing translation: ${key}`);
      return key;
    }

    // Replace parameters like {name}
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      for (const [param, val] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${param}\\}`, 'g'), val);
      }
    }

    return value;
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, key) {
    if (!obj) return undefined;
    const keys = key.split('.');
    let value = obj;
    for (const k of keys) {
      if (value === undefined || value === null) return undefined;
      value = value[k];
    }
    return value;
  }

  /**
   * Apply translations to all elements with data-i18n attributes
   */
  apply() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const translation = this.t(key);
      if (translation !== key) {
        el.textContent = translation;
      }
    });

    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      const translation = this.t(key);
      if (translation !== key) {
        el.placeholder = translation;
      }
    });

    // Titles (tooltips)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      const translation = this.t(key);
      if (translation !== key) {
        el.title = translation;
      }
    });

    // HTML lang attribute
    document.documentElement.lang = this.locale;

    // Update language selector if present
    const langSelector = document.getElementById('lang-selector');
    if (langSelector) {
      langSelector.value = this.locale;
    }

    // Dispatch event for dynamic content
    window.dispatchEvent(new CustomEvent('i18n:changed', { detail: { locale: this.locale } }));
  }

  /**
   * Get current locale
   */
  getLocale() {
    return this.locale;
  }

  /**
   * Get available locales
   */
  getAvailableLocales() {
    return [
      { code: 'fr', name: 'Français' },
      { code: 'en', name: 'English' }
    ];
  }
}

// Create global instance
window.i18n = new I18n();

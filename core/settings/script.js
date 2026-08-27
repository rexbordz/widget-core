(function () {
  const query = new URLSearchParams(window.location.search);
  const sessionKey = query.get('sessionKey');

  if (!sessionKey) {
    document.body.innerHTML = '<p style="padding:24px;color:white;font-family:sans-serif;">Missing settings-core session key.</p>';
    return;
  }

  let boot;
  try {
    boot = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
  } catch (error) {
    console.error(error);
  }

  if (!boot || !boot.configUrl || !boot.widgetUrl || !boot.hooksUrl) {
    document.body.innerHTML = '<p style="padding:24px;color:white;font-family:sans-serif;">Missing required settings-core boot config.</p>';
    return;
  }

  const GLOBAL_FOOTER = {
    patreon: {
      href: 'https://www.patreon.com/rexbordz',
      icon: '../../assets/images/patreon-icon.png',
      text: 'Get more stream widgets like this!'
    },
    credit: 'Made by rexbordz',
    socials: [
      { label: 'YouTube', href: 'https://youtube.com/@rexbordz', icon: 'https://www.svgrepo.com/show/513089/youtube-168.svg' },
      { label: 'TikTok', href: 'https://tiktok.com/@rexbordz', icon: 'https://www.svgrepo.com/show/333611/tiktok.svg' },
      { label: 'Twitch', href: 'https://twitch.tv/rexbordz', icon: 'https://www.svgrepo.com/show/447120/twitch-fill.svg' },
      { label: 'Kick', href: 'https://kick.com/rexbordz', icon: '../../assets/images/kick-logo.svg' },
      { label: 'Discord', href: 'https://discord.gg/pJWEPzbdfa', icon: 'https://www.svgrepo.com/show/473585/discord.svg' },
      { label: 'X', href: 'https://x.com/rexbordz', icon: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/X_logo_2023.svg' },
      { label: 'GitHub', href: 'https://github.com/rexbordz', icon: 'https://www.svgrepo.com/show/512317/github-142.svg' }
    ]
  };

  const GLOBAL_KOFI = {
    username: 'rexbordz',
    options: {
      type: 'floating-chat',
      'floating-chat.donateButton.text': 'Donate',
      'floating-chat.donateButton.background-color': '#00b9fe',
      'floating-chat.donateButton.text-color': '#fff'
    }
  };

  const state = {
    config: null,
    hooks: null,
    page: boot.page || {},
    widgetUrl: boot.widgetUrl,
    elements: {}
  };

  const dom = {
    form: document.getElementById('settingsForm'),
    actions: document.getElementById('actionArea'),
    applyButton: document.getElementById('applySettings'),
    loadDefaultsButton: document.getElementById('loadDefaultsButton'),
    openLoadSettingsModalButton: document.getElementById('openLoadSettingsModalButton'),
    previewFrame: document.getElementById('previewFrame'),
    widgetTitle: document.getElementById('widgetTitle'),
    widgetLogo: document.getElementById('widgetLogo'),
    footer: document.getElementById('settingsFooter'),
    settingsPanel: document.querySelector('.settings-panel'),
    panelResizer: document.getElementById('panelResizer'),
    modal: document.getElementById('loadSettingsModal'),
    modalUrlInput: document.getElementById('loadSettingsUrlInput'),
    modalError: document.getElementById('loadSettingsError'),
    confirmLoadSettingsButton: document.getElementById('confirmLoadSettingsButton'),
    loadingOverlay: document.getElementById('loading-overlay'),
    obsConnectButton: document.getElementById('obsConnectButton'),
    obsStatusDot: document.getElementById('obsStatusDot'),
    obsConnectionDialog: document.getElementById('obsConnectionDialog'),
    obsModalWarning: document.getElementById('obsModalWarning'),
    obsPort: document.getElementById('obsPort'),
    obsPassword: document.getElementById('obsPassword'),
    obsConnectSubmit: document.getElementById('obsConnectSubmit')
  };

  const OBS_STORAGE_KEYS = { port: 'obs_ws_port', password: 'obs_ws_password' };
  const OBS_DEFAULT_PORT = '4455';
  const OBS_RETRY_INTERVAL_MS = 5000;

  let obs = null;
  let obsConnected = false;
  let obsConnecting = false;
  let obsRetryTimer = null;

  init().catch((error) => {
    console.error(error);
    document.body.innerHTML = '<p style="padding:24px;color:white;font-family:sans-serif;">Failed to load settings core.</p>';
  });

  async function init() {
    const [config] = await Promise.all([
      fetch(boot.configUrl).then((r) => r.json()),
      loadScript(boot.hooksUrl)
    ]);

    state.config = config;
    state.hooks = {
      buildPreviewUrl: (url, values) => url,
      buildShareUrl: (url, values) => url,
      createTestAlert: () => null,
      ...(window.WidgetSettingsHooks || {})
    };

    applyMeta();
    dom.modalUrlInput.placeholder = state.widgetUrl + "?...";
    renderSections();
    renderActions();
    renderFooter();
    restoreSavedValues();
    wireEvents();

    // WA custom elements upgrade asynchronously; wait for every tag used on
    // the page (dynamically-built fields plus the static wa-dialog/wa-textarea
    // in the modal) so the first updatePreview() reads real .value getters
    // instead of undefined from not-yet-upgraded elements, and so the loading
    // overlay covers the whole pre-upgrade flash rather than just part of it.
    await waitForCustomElements();

    updatePreview();
    initKofi();
    initObs();
    hideLoadingOverlay();
  }

  function waitForCustomElements(timeoutMs = 8000) {
    // Ask the DOM which WA elements are actually on the page rather than
    // hardcoding a list. WA's autoloader only ever defines elements it finds
    // here, so waiting on a fixed list stalls until the timeout whenever a
    // config doesn't happen to use one of them — a widget with no colour
    // fields never creates a wa-color-picker, and that alone cost 8 seconds.
    // Must run after renderSections(), once the fields exist.
    const tags = [...new Set(
      Array.from(document.querySelectorAll(':not(:defined)'))
        .map((el) => el.tagName.toLowerCase())
        .filter((tag) => tag.startsWith('wa-'))
    )];

    const ready = Promise.all(tags.map((tag) => customElements.whenDefined(tag)));

    // Race against a timeout so a CDN hiccup can't strand the user on the
    // spinner forever — worst case they see an unstyled flash instead.
    return Promise.race([ready, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  function hideLoadingOverlay() {
    dom.loadingOverlay?.classList.add('is-hidden');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function applyMeta() {
    document.title = state.page.pageTitle || 'Widget Settings';
    dom.widgetTitle.textContent = state.page.widgetTitle || 'Widget Settings';

    if (state.page.logo && dom.widgetLogo) {
      dom.widgetLogo.src = state.page.logo;
    }

    if (state.page.favicon) {
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = state.page.favicon;
    }
  }

  function renderSections() {
    dom.form.innerHTML = '';

    (state.config.sections || []).forEach((section) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'form-section';

      const heading = document.createElement('h2');
      heading.textContent = section.title;
      wrapper.appendChild(heading);

      if (section.note) {
        const note = document.createElement('p');
        note.className = 'section-note';
        note.innerHTML = section.note;
        wrapper.appendChild(note);
      }

      (section.fields || []).forEach((field) => {
        const row = buildField(field);
        wrapper.appendChild(row);
      });

      dom.form.appendChild(wrapper);
    });
  }

  function buildField(field) {
    const row = document.createElement('div');
    const isCheckbox = field.type === 'checkbox';
    row.className = isCheckbox ? 'toggle-row' : 'form-row';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'field-label-wrap';

    const label = document.createElement('label');
    label.htmlFor = field.id;
    label.textContent = field.label;
    labelWrap.appendChild(label);

    if (field.note) {
      const note = document.createElement('div');
      note.className = 'field-note';
      note.innerHTML = field.note;
      labelWrap.appendChild(note);
    }

    let input;

    if (isCheckbox) {
      const switchLabel = document.createElement('label');
      switchLabel.className = 'switch';

      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = field.id;
      input.checked = Boolean(field.defaultValue);

      const slider = document.createElement('span');
      slider.className = 'slider';

      switchLabel.appendChild(input);
      switchLabel.appendChild(slider);

      row.appendChild(labelWrap);
      row.appendChild(switchLabel);
    } else if (field.type === 'select') {
      input = document.createElement('wa-select');
      input.id = field.id;

      (field.options || []).forEach((option) => {
        const optionEl = document.createElement('wa-option');
        optionEl.setAttribute('value', option.value);
        optionEl.textContent = option.label;

        if (String(option.value) === String(field.defaultValue)) {
          optionEl.setAttribute('selected', '');
        }

        input.appendChild(optionEl);
      });

      row.appendChild(labelWrap);
      row.appendChild(input);
    } else if (field.type === 'number') {
      input = document.createElement('wa-number-input');
      input.id = field.id;

      if (field.defaultValue !== undefined && field.defaultValue !== '') input.value = field.defaultValue;
      if (field.placeholder !== undefined) input.setAttribute('placeholder', field.placeholder);
      if (field.min !== undefined) input.setAttribute('min', field.min);
      if (field.max !== undefined) input.setAttribute('max', field.max);
      if (field.step !== undefined) input.setAttribute('step', field.step);

      row.appendChild(labelWrap);
      row.appendChild(input);
    } else if (field.type === 'color-hex' || field.type === 'color-rgba') {
      input = document.createElement('wa-color-picker');
      input.id = field.id;
      input.setAttribute('format', field.type === 'color-rgba' ? 'rgb' : 'hex');
      if (field.type === 'color-rgba') input.setAttribute('opacity', '');
      input.setAttribute('label', field.label || '');
      if (field.defaultValue !== undefined) input.setAttribute('value', field.defaultValue);

      row.appendChild(labelWrap);
      row.appendChild(input);
    } else if (field.type === 'text') {
      input = document.createElement('wa-input');
      input.id = field.id;

      if (field.defaultValue !== undefined) input.value = field.defaultValue;
      if (field.placeholder) input.setAttribute('placeholder', field.placeholder);

      row.appendChild(labelWrap);
      row.appendChild(input);
    } else {
      input = document.createElement('input');
      input.id = field.id;
      input.type = field.type;

      if (field.defaultValue !== undefined) input.value = field.defaultValue;
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;

      row.appendChild(labelWrap);
      row.appendChild(input);
    }

    state.elements[field.id] = input;
    return row;
  }

  function renderActions() {
    dom.actions.innerHTML = '';

    if (
      typeof state.hooks?.createTestAlert === 'function' &&
      Array.isArray(state.page.testButtons) &&
      state.page.testButtons.length
    ) {
      const row = document.createElement('div');
      row.className = 'test-button-row';

      const count = state.page.testButtons.length;
      const columns = count === 4 ? 2 : Math.min(3, count);
      row.style.setProperty('--test-button-columns', columns);

      state.page.testButtons.forEach((buttonConfig) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = buttonConfig.label;
        button.addEventListener('click', () => sendTestAlert(buttonConfig));
        row.appendChild(button);
      });

      dom.actions.appendChild(row);
    }

    dom.applyButton.textContent = state.page.copyButtonLabel || 'Copy Link URL';
  }

  function renderFooter() {
    const footer = GLOBAL_FOOTER;
    const parts = [];

    if (footer.patreon) {
      parts.push(`
        <div class="footer-patreon">
          <a href="${footer.patreon.href}" target="_blank" rel="noopener noreferrer">
            <button class="patreon-btn" type="button">
              <img src="${footer.patreon.icon}" alt="Patreon Logo">
              ${footer.patreon.text}
            </button>
          </a>
        </div>
      `);
    }

    if (footer.credit) {
      parts.push(`<div class="footer-credit">${footer.credit}</div>`);
    }

    if (Array.isArray(footer.socials) && footer.socials.length) {
      parts.push(
        '<div class="footer-socials">' +
          footer.socials
            .map(
              (social) => `
                <a href="${social.href}" target="_blank" rel="noopener noreferrer" aria-label="${social.label}">
                  <img src="${social.icon}" class="social-icon" alt="${social.label}">
                </a>
              `
            )
            .join('') +
        '</div>'
      );
    }

    dom.footer.innerHTML = parts.join('');
  }

  function wireEvents() {
    Object.values(state.elements).forEach((element) => {
      element.addEventListener('input', updatePreview);
      element.addEventListener('change', updatePreview);
    });

    dom.applyButton.addEventListener('click', copyWidgetUrl);
    dom.loadDefaultsButton.addEventListener('click', loadDefaults);
    dom.openLoadSettingsModalButton.addEventListener('click', openLoadSettingsModal);
    dom.confirmLoadSettingsButton.addEventListener('click', handleLoadSettingsConfirm);

    dom.modal.addEventListener('wa-show', () => {
      document.body.classList.add('modal-open');
    });

    dom.modal.addEventListener('wa-after-hide', () => {
      document.body.classList.remove('modal-open');
      dom.modalError.classList.add('hidden');
    });

    wirePanelResizer();
  }

  function wirePanelResizer() {
    const PANEL_MIN_WIDTH = 360;
    const PANEL_MAX_WIDTH = 720;

    dom.panelResizer.addEventListener('mousedown', (event) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = dom.settingsPanel.getBoundingClientRect().width;

      document.body.classList.add('panel-resizing');
      dom.panelResizer.classList.add('is-active');

      const onMouseMove = (moveEvent) => {
        const newWidth = startWidth + (moveEvent.clientX - startX);
        const clampedWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, newWidth));
        dom.settingsPanel.style.width = clampedWidth + 'px';
      };

      const onMouseUp = () => {
        document.body.classList.remove('panel-resizing');
        dom.panelResizer.classList.remove('is-active');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function getAllFields() {
    return (state.config.sections || []).flatMap((section) => section.fields || []);
  }

  function collectValues() {
    const values = {};

    (state.config.sections || []).forEach((section) => {
      (section.fields || []).forEach((field) => {
        const element = state.elements[field.id];
        if (!element) return;

        if (field.type === 'checkbox') {
          values[field.id] = element.checked;
        } else if (field.type === 'number') {
          const raw = element.value;
          values[field.id] = (raw === '' || raw === null || raw === undefined) ? '' : Number(raw);
        } else {
          values[field.id] = element.value;
        }
      });
    });

    return values;
  }

  function restoreSavedValues() {
    const storageKey = state.page.storageKey || 'widget-settings';
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const savedValues = JSON.parse(raw);

      Object.entries(savedValues).forEach(([key, value]) => {
        const element = state.elements[key];
        if (!element) return;

        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else {
          element.value = value;
        }
      });
    } catch (error) {
      console.warn('Could not restore saved settings', error);
    }
  }

  function persistValues(values) {
    const storageKey = state.page.storageKey || 'widget-settings';
    localStorage.setItem(storageKey, JSON.stringify(values));
  }

  function buildWidgetParams(values) {
    const params = new URLSearchParams();

    getAllFields().forEach((field) => {
      const element = state.elements[field.id];
      if (!element) return;

      // allow fields to opt out from widget URL
      if (field.includeInWidgetParams === false) return;

      // optional custom param name, otherwise use the field id
      const paramName = field.param || field.id;
      const value = values[field.id];

      if (field.type === 'checkbox') {
        // omit true by default, only include false
        if (value === false) {
          params.set(paramName, 'false');
        }
        return;
      }

      if (value === '' || value === null || value === undefined) return;

      params.set(paramName, String(value).trim ? String(value).trim() : String(value));
    });

    if (typeof state.hooks?.transformWidgetParams === 'function') {
      return state.hooks.transformWidgetParams(params, values, state.config);
    }

    return params;
  }

  function buildWidgetUrl(values) {
    const params = buildWidgetParams(values);
    const qs = params.toString();
    return qs ? `${state.widgetUrl}?${qs}` : state.widgetUrl;
  }

  function updatePreview() {
    const values = collectValues();
    persistValues(values);
    dom.previewFrame.src = buildWidgetUrl(values);
  }

  function sendTestAlert(buttonConfig) {
    const values = collectValues();
    const payload = state.hooks.createTestAlert(buttonConfig, values);

    if (!payload) return;

    dom.previewFrame.contentWindow?.postMessage(
      { type: 'testAlert', data: payload },
      '*'
    );
  }

  async function copyWidgetUrl() {
    const values = collectValues();
    persistValues(values);
    const targetUrl = buildWidgetUrl(values);

    try {
      await navigator.clipboard.writeText(targetUrl);
      flashButton(dom.applyButton, 'Link copied to clipboard', '#4CAF50', 5000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      flashButton(dom.applyButton, 'Failed to copy link', '#d9534f', 3000);
    }
  }

  function loadDefaults({ silent = false } = {}) {
  getAllFields().forEach((field) => {
    const element = state.elements[field.id];
    if (!element) return;

    if (field.type === 'checkbox') {
      element.checked = Boolean(field.defaultValue);
      return;
    }

    if (field.type === 'select') {
      element.value = field.defaultValue ?? '';
      return;
    }

    element.value = field.defaultValue ?? '';
  });

  if (!silent) {
    updatePreview();
    flashButton(dom.loadDefaultsButton, 'Defaults loaded', '#4CAF50', 2500);
  }
}

  function openLoadSettingsModal() {
    dom.modalUrlInput.value = '';
    dom.modalError.classList.add('hidden');
    dom.modal.open = true;

    setTimeout(() => {
      dom.modalUrlInput.focus();
    }, 0);
  }

  function closeLoadSettingsModal() {
    dom.modal.open = false;
  }

  function handleLoadSettingsConfirm() {
    const rawUrl = dom.modalUrlInput.value.trim();

    if (!rawUrl) {
      showModalError('Please enter a valid widget URL.');
      return;
    }

    try {
      const parsedUrl = new URL(rawUrl);

      // Reset to defaults first
      loadDefaults({ silent: true });

      const appliedCount = applyValuesFromUrl(parsedUrl);

      closeLoadSettingsModal();
      updatePreview();
      flashButton(dom.openLoadSettingsModalButton, 'Settings loaded', '#4CAF50', 2500);

    } catch (error) {
      console.error(error);
      showModalError('Please enter a valid widget URL.');
    }
  }

  function applyValuesFromUrl(parsedUrl) {
    const params = parsedUrl.searchParams;
    let appliedCount = 0;

    getAllFields().forEach((field) => {
      const paramName = field.param || field.id;
      if (!params.has(paramName)) return;

      const element = state.elements[field.id];
      if (!element) return;

      const rawValue = params.get(paramName);

      if (field.type === 'checkbox') {
        element.checked = rawValue === 'true' || rawValue === '1';
        appliedCount += 1;
        return;
      }

      if (field.type === 'number') {
        if (rawValue === '') {
          element.value = '';
          appliedCount += 1;
          return;
        }

        const num = Number(rawValue);
        if (!Number.isNaN(num)) {
          element.value = String(num);
          appliedCount += 1;
        }

        return;
      }

      element.value = rawValue;
      appliedCount += 1;
    });

    return appliedCount;
  }

  function showModalError(message) {
    dom.modalError.textContent = message;
    dom.modalError.classList.remove('hidden');
  }

  function flashButton(button, text, bg, delay) {
    const originalText = button.textContent;
    const originalBg = button.style.backgroundColor;

    button.disabled = true;
    button.style.backgroundColor = bg;
    button.textContent = text;

    setTimeout(() => {
      button.style.backgroundColor = originalBg;
      button.textContent = originalText;
      button.disabled = false;
    }, delay);
  }

  function initKofi() {
    if (!window.kofiWidgetOverlay) return;
    window.kofiWidgetOverlay.draw(GLOBAL_KOFI.username, GLOBAL_KOFI.options);
  }

  function loadObsSettings() {
    return {
      port: localStorage.getItem(OBS_STORAGE_KEYS.port) || OBS_DEFAULT_PORT,
      password: localStorage.getItem(OBS_STORAGE_KEYS.password) || ''
    };
  }

  function saveObsSettings(port, password) {
    localStorage.setItem(OBS_STORAGE_KEYS.port, port);
    localStorage.setItem(OBS_STORAGE_KEYS.password, password);
  }

  function updateObsStatus() {
    if (!dom.obsStatusDot) return;
    dom.obsStatusDot.classList.toggle('online', obsConnected);
    dom.obsStatusDot.classList.toggle('offline', !obsConnected);
    if (dom.obsConnectButton) {
      dom.obsConnectButton.title = obsConnected ? 'Connected to OBS' : 'Disconnected from OBS';
    }
  }

  async function connectObs(port, password) {
    if (obsConnecting) return;
    obsConnecting = true;

    if (obs) {
      try {
        await obs.disconnect();
      } catch (error) {
        // already disconnected, ignore
      }
    }

    if (!window.OBSWebSocket) {
      console.warn('obs-websocket-js failed to load; cannot connect to OBS.');
      obsConnecting = false;
      obsConnected = false;
      updateObsStatus();
      resetObsConnectSubmit();
      return;
    }

    obs = new window.OBSWebSocket();

    obs.on('ConnectionClosed', () => {
      obsConnected = false;
      obsConnecting = false;
      updateObsStatus();
      if (dom.obsModalWarning) dom.obsModalWarning.classList.remove('hidden');
    });

    try {
      await obs.connect(`ws://127.0.0.1:${port}`, password || undefined);
      obsConnected = true;
      obsConnecting = false;
      saveObsSettings(port, password);
      updateObsStatus();
      if (dom.obsModalWarning) dom.obsModalWarning.classList.add('hidden');
      closeObsModal();
    } catch (error) {
      console.warn('Failed to connect to OBS:', error?.message || error);
      obsConnected = false;
      obsConnecting = false;
      updateObsStatus();
      if (dom.obsModalWarning) dom.obsModalWarning.classList.remove('hidden');
    } finally {
      resetObsConnectSubmit();
    }
  }

  function startObsRetryLoop() {
    if (obsRetryTimer) return;
    obsRetryTimer = setInterval(() => {
      if (obsConnected || obsConnecting) return;
      const saved = loadObsSettings();
      connectObs(saved.port, saved.password);
    }, OBS_RETRY_INTERVAL_MS);
  }

  function resetObsConnectSubmit() {
    if (!dom.obsConnectSubmit) return;
    dom.obsConnectSubmit.disabled = false;
    dom.obsConnectSubmit.textContent = 'Connect';
  }

  function openObsModal() {
    const saved = loadObsSettings();
    dom.obsPort.value = saved.port;
    dom.obsPassword.value = saved.password;
    if (dom.obsModalWarning) dom.obsModalWarning.classList.toggle('hidden', obsConnected);
    dom.obsConnectionDialog.open = true;
  }

  function closeObsModal() {
    dom.obsConnectionDialog.open = false;
  }

  function initObs() {
    if (!dom.obsConnectButton || !dom.obsConnectionDialog) return;

    updateObsStatus();

    dom.obsConnectButton.addEventListener('click', openObsModal);

    dom.obsConnectionDialog.addEventListener('wa-show', () => {
      document.body.classList.add('modal-open');
    });

    dom.obsConnectionDialog.addEventListener('wa-after-hide', () => {
      document.body.classList.remove('modal-open');
    });

    dom.obsConnectSubmit.addEventListener('click', () => {
      const port = dom.obsPort.value.trim() || OBS_DEFAULT_PORT;
      const password = dom.obsPassword.value.trim();

      dom.obsConnectSubmit.disabled = true;
      dom.obsConnectSubmit.textContent = 'Connecting...';

      connectObs(port, password);
    });

    const saved = loadObsSettings();
    connectObs(saved.port, saved.password);
    startObsRetryLoop();
  }

})();
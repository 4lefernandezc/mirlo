(() => {
  'use strict';
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);
  const el = (id) => document.getElementById(id);
  const categories = ['General', 'Playback', 'Sound', 'Appearance', 'Integrations'];
  const pluginCategories = {
    'blur-nav-bar': 'Appearance', 'compact-sidebar': 'Appearance', 'album-color-theme': 'Appearance',
    'video-toggle': 'Playback', 'unobtrusive-player': 'Appearance', 'disable-autoplay': 'Playback',
    'exponential-volume': 'Sound', 'playback-speed': 'Playback', 'skip-silences': 'Sound',
    'equalizer': 'Sound', 'precise-volume': 'Sound', 'skip-disliked-songs': 'Playback',
    'captions-selector': 'Playback', 'quality-changer': 'Playback', 'navigation': 'Appearance',
    'sponsorblock': 'Integrations', 'album-actions': 'Playback', 'synced-lyrics': 'Playback',
    'user-theme': 'Appearance', 'settings-button': 'Appearance',
  };
  const generalFields = [
    ['hotkeys_enabled', 'Global media hotkeys', 'General', 'restart'],
    ['update_check', 'Check for updates on startup', 'General', 'now', 'Updates install only after you confirm.'],
    ['adblock', 'Ad blocking', 'Playback', 'now'],
    ['resume_playback', 'Resume playback where you left off', 'Playback', 'now', 'Restores your last track and position when Mirlo starts.'],
    ['minimize_to_tray', 'Hide to the tray when minimized', 'Appearance', 'now'],
    ['close_to_tray', 'Hide to the tray when closed', 'Appearance', 'now', 'Use Quit in the tray menu to exit Mirlo.'],
    ['notifications', 'Track-change notifications', 'Integrations', 'now', 'Only when Mirlo is not the foreground window.'],
    ['discord_rpc', 'Discord Rich Presence', 'Integrations', 'now', 'Shows what you are listening to while Discord is running.'],
  ];
  let fullConfig;
  let translate = (text) => text;
  let saveQueue = Promise.resolve();
  const rows = [];
  const groups = new Map();
  let timerState = { id: 0, mode: 'off' };
  let timerRequest = 0;
  let timerPolling = false;
  let timerBusy = false;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const status = (text, error = false) => {
    el('status').textContent = text;
    el('status').dataset.error = String(error);
  };
  const getPath = (object, path) => path.reduce((value, key) => value?.[key], object);
  const setPath = (object, path, value) => {
    let target = object;
    for (const key of path.slice(0, -1)) target = target[key] ||= {};
    target[path[path.length - 1]] = value;
  };
  const normalized = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function filter() {
    const query = normalized(el('search').value.trim());
    const category = el('category').value;
    let visible = 0;
    for (const row of rows) {
      row.element.hidden = !!((category && category !== row.category) ||
        (query && !row.text.includes(query)) || (el('enabled-only').checked && !row.enabled()));
      if (!row.element.hidden) visible++;
    }
    for (const [category, group] of groups) {
      group.section.hidden = !rows.some((row) => row.category === category && !row.element.hidden);
      group.general.hidden = !group.general.children.length ||
        [...group.general.children].every((child) => child.hidden);
    }
    el('empty').hidden = visible > 0;
  }

  function save(patch, apply) {
    const task = saveQueue.then(async () => {
      status(translate('Saving…'));
      try {
        fullConfig = await invoke('patch_settings', { patch });
        status(translate(apply === 'restart' ? 'Saved. Restart Mirlo to apply.' :
          apply === 'reload' ? 'Saved. Reload the player to apply.' : 'Saved. Applies immediately.'));
        filter();
      } catch (error) {
        status(`${translate('Could not save. Your previous settings are unchanged.')} ${String(error)}`, true);
        throw error;
      }
    });
    saveQueue = task.catch(() => {});
    return task;
  }

  function bind(control, read, patch, apply) {
    const refresh = () => {
      if (control.type === 'checkbox') control.checked = !!read();
      else control.value = read() ?? '';
    };
    refresh();
    control.addEventListener('change', async () => {
      if (!control.checkValidity()) {
        status(translate('Enter a valid value within the allowed range.'), true);
        refresh();
        return;
      }
      const value = control.type === 'checkbox' ? control.checked :
        control.type === 'number' ? Number(control.value) : control.value;
      control.disabled = true;
      try {
        await save(patch(value), apply);
      } catch (_) {
        refresh();
      } finally {
        control.disabled = false;
      }
    });
  }

  function renderGeneral() {
    for (const [key, title, category, apply, description] of generalFields) {
      const label = node('label', undefined, 'field inline');
      const control = node('input');
      control.type = 'checkbox';
      control.id = key;
      const copy = node('span', translate(title));
      copy.appendChild(node('small', translate(description ||
        (apply === 'restart' ? 'Restart Mirlo to apply' : 'Applies immediately'))));
      label.append(control, copy);
      bind(control, () => fullConfig[key], (value) => ({ [key]: value }), apply);
      groups.get(category).general.appendChild(label);
      rows.push({ element: label, category, text: normalized(`${translate(title)} ${translate(description || '')}`),
        enabled: () => !!fullConfig[key] });
    }
  }

  function renderOption(plugin, option) {
    const label = node('label', undefined, `field${option.type === 'boolean' ? ' inline' : ''}${option.type === 'textarea' ? ' wide' : ''}`);
    const control = node(option.type === 'select' ? 'select' : option.type === 'textarea' ? 'textarea' : 'input');
    control.dataset.path = option.path.join('.');
    if (option.type === 'select') {
      for (const choice of option.choices) {
        const entry = node('option', translate(choice));
        entry.value = choice;
        control.appendChild(entry);
      }
    } else if (option.type === 'textarea') {
      control.rows = option.rows || 6;
      control.spellcheck = false;
    } else {
      control.type = option.type === 'boolean' ? 'checkbox' : option.type === 'number' ? 'number' : 'text';
      for (const property of ['min', 'max', 'step']) {
        if (option[property] !== undefined) control[property] = option[property];
      }
      if (option.type === 'number') control.required = true;
    }
    const apply = option.path[0] === 'globalShortcuts' ? 'restart' : 'reload';
    bind(control, () => getPath(fullConfig.plugins[plugin.id], option.path) ?? option.default, (value) => {
      const patch = { plugins: { [plugin.id]: {} } };
      setPath(patch.plugins[plugin.id], option.path, value);
      return patch;
    }, apply);
    if (option.type === 'boolean') label.append(control, node('span', translate(option.label)));
    else label.append(node('span', translate(option.label)), control);
    if (apply === 'restart') label.appendChild(node('small', translate('Restart required for global shortcuts')));
    return label;
  }

  function renderPlugin(plugin) {
    const category = pluginCategories[plugin.id] || 'General';
    const article = node('article', undefined, 'plugin');
    article.dataset.plugin = plugin.id;
    const head = node('div', undefined, 'head');
    const enabled = () => plugin.always || (fullConfig.plugins[plugin.id]?.enabled ?? plugin.enabled !== false);
    if (!plugin.always) {
      const toggle = node('input');
      toggle.type = 'checkbox';
      toggle.setAttribute('aria-label', `${translate('Enable')} ${translate(plugin.name)}`);
      bind(toggle, enabled, (value) => ({ plugins: { [plugin.id]: { enabled: value } } }), 'reload');
      head.appendChild(toggle);
    }
    head.append(node('strong', translate(plugin.name)), node('span', translate('Reload required'), 'badge'));
    article.appendChild(head);
    if (plugin.description) article.appendChild(node('p', translate(plugin.description), 'desc'));
    const options = node('div', undefined, 'options');
    for (const option of plugin.options || []) options.appendChild(renderOption(plugin, option));
    article.appendChild(options);
    groups.get(category).plugins.appendChild(article);
    rows.push({ element: article, category, enabled,
      text: normalized([plugin.id, translate(plugin.name), translate(plugin.description || ''),
        ...(plugin.options || []).map((option) => translate(option.label))].join(' ')) });
  }

  function renderCountdown() {
    let text = translate('No timer running.');
    if (timerState.mode === 'track') text = translate('At the end of this track');
    else if (timerState.mode === 'expired') text = translate('Pausing playback…');
    else if (timerState.mode === 'minutes') {
      const seconds = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));
      text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    el('timer-countdown').textContent = text;
    el('timer-start').disabled = timerBusy;
    el('timer-cancel').disabled = timerBusy || timerState.mode === 'off';
  }

  function acceptTimer(snapshot) {
    if (snapshot.id < timerState.id) return;
    timerState = snapshot;
    renderCountdown();
    filter();
  }

  async function refreshTimer() {
    if (timerPolling || timerBusy || document.hidden) return;
    const request = timerRequest;
    timerPolling = true;
    try {
      const snapshot = await invoke('get_sleep_timer');
      if (request === timerRequest) acceptTimer(snapshot);
    } catch (_) {
      if (request === timerRequest) el('timer-countdown').textContent = translate('Could not read the timer.');
    } finally {
      timerPolling = false;
    }
  }

  async function setTimer(preset) {
    timerRequest++;
    timerBusy = true;
    renderCountdown();
    try {
      acceptTimer(await invoke('set_sleep_timer', { preset }));
      status(translate(preset === 'off' ? 'Timer canceled.' : 'Timer started.'));
    } catch (error) {
      status(`${translate('Could not set the timer.')} ${translate(String(error))}`, true);
    } finally {
      timerBusy = false;
      renderCountdown();
    }
  }

  function renderTimer() {
    const article = node('article', undefined, 'plugin');
    article.id = 'sleep-timer';
    article.append(node('strong', translate('Sleep timer')),
      node('p', translate('Pauses playback, including while Mirlo is in the tray. Resets when Mirlo exits.'), 'desc'));
    const actions = node('div', undefined, 'timer-actions');
    const label = node('label', translate('Duration'), 'field');
    const select = node('select');
    select.id = 'timer-preset';
    for (const [value, text] of [['15', '15 minutes'], ['30', '30 minutes'], ['60', '60 minutes'], ['track', 'At the end of this track']]) {
      const choice = node('option', translate(text));
      choice.value = value;
      select.appendChild(choice);
    }
    select.value = '15';
    label.appendChild(select);
    const start = node('button', translate('Start timer'));
    start.id = 'timer-start';
    start.addEventListener('click', () => setTimer(select.value));
    const cancel = node('button', translate('Cancel timer'));
    cancel.id = 'timer-cancel';
    cancel.addEventListener('click', () => setTimer('off'));
    const countdown = node('output', undefined, 'countdown');
    countdown.id = 'timer-countdown';
    countdown.setAttribute('role', 'timer');
    countdown.setAttribute('aria-live', 'off');
    actions.append(label, start, cancel);
    article.append(actions, countdown,
      node('small', translate('Changing tracks cancels the end-of-track timer. System sleep counts toward timed pauses.')));
    groups.get('Playback').plugins.appendChild(article);
    rows.push({ element: article, category: 'Playback', text: normalized(translate('Sleep timer')),
      enabled: () => timerState.mode !== 'off' });
    renderCountdown();
  }

  async function init() {
    try {
      const [language, manifest, config] = await Promise.all([
        invoke('get_settings_locale'), invoke('get_plugin_manifest'), invoke('get_config'),
      ]);
      document.documentElement.lang = language === 'es' ? 'es' : 'en';
      translate = (text) => language === 'es' ? (window.__MIRLO_SETTINGS_ES__[text] ?? text) : text;
      document.title = `Mirlo - ${translate('Settings')}`;
      for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = translate(element.dataset.i18n);
      el('search').placeholder = translate('Search by name or option…');
      el('reload').title = translate('Reloads the player page so extension changes apply');
      const all = node('option', translate('All categories'));
      all.value = '';
      el('category').appendChild(all);
      fullConfig = config;
      fullConfig.plugins ||= {};
      for (const category of categories) {
        const choice = node('option', translate(category));
        choice.value = category;
        el('category').appendChild(choice);
        const section = node('section');
        const heading = node('h2', translate(category));
        heading.id = `category-${category}`;
        section.setAttribute('aria-labelledby', heading.id);
        const general = node('div', undefined, 'general');
        const plugins = node('div');
        section.append(heading, general, plugins);
        el('groups').appendChild(section);
        groups.set(category, { section, general, plugins });
      }
      renderTimer();
      renderGeneral();
      for (const plugin of manifest) renderPlugin(plugin);
      for (const id of ['search', 'category', 'enabled-only', 'reload']) el(id).disabled = false;
      filter();
      status('');
      await refreshTimer();
      setInterval(() => {
        renderCountdown();
        refreshTimer();
      }, 1000);
    } catch (error) {
      status(`${translate('Could not load settings.')} ${String(error)}`, true);
    }
  }
  el('search').addEventListener('input', filter);
  el('category').addEventListener('change', filter);
  el('enabled-only').addEventListener('change', filter);
  el('reload').addEventListener('click', async () => {
    el('reload').disabled = true;
    await saveQueue;
    try {
      await invoke('reload_player');
      status(translate('Player reloaded.'));
    } catch (error) {
      status(`${translate('Could not reload the player.')} ${String(error)}`, true);
    } finally {
      el('reload').disabled = false;
    }
  });
  init();
})();

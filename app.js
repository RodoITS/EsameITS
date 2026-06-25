/* ===========================================================
   GustoLinea - Controllo Lotti
   Modulo applicativo: stato, sessione, login, anagrafica lotti,
   shell con vista filtrata per ruolo, autorizzazione applicata
   anche lato logica (non solo nascondendo i pulsanti) e backup
   dei dati. Nessun backend: sessione e lotti sono simulati e
   persistiti in localStorage.
   =========================================================== */

const SESSION_KEY = 'gustolinea:session';
const LOTS_KEY = 'gustolinea:lotti';

const VIEWS = {
  dashboard: { id: 'dashboard', label: 'Dashboard' },
  consultazione: { id: 'consultazione', label: 'Consultazione lotti' },
  produzione: { id: 'produzione', label: 'Avvio/fine produzione' },
  controlliQualita: { id: 'controlliQualita', label: 'Esito controllo qualità' },
  nonConformita: { id: 'nonConformita', label: 'Verifiche e non conformità' },
  spedizioni: { id: 'spedizioni', label: 'Registrazione spedizione' },
};

// Dati dimostrativi: un profilo per ruolo operativo piu' un account admin
// con accesso completo a tutte le viste.
const DEMO_USERS = [
  {
    id: 'u01',
    name: 'Marco Bellini',
    roleId: 'operatore_produzione',
    roleLabel: 'Operatore di Produzione',
    code: 'OP-PROD-01',
    group: 'Ruoli operativi',
    views: ['dashboard', 'consultazione', 'produzione'],
  },
  {
    id: 'u02',
    name: 'Giulia Sarti',
    roleId: 'addetto_qualita',
    roleLabel: 'Addetto Qualità',
    code: 'OP-QA-02',
    group: 'Ruoli operativi',
    views: ['dashboard', 'consultazione', 'controlliQualita'],
  },
  {
    id: 'u03',
    name: 'Davide Conti',
    roleId: 'responsabile_qualita',
    roleLabel: 'Responsabile Qualità',
    code: 'RESP-QA-03',
    group: 'Ruoli operativi',
    views: ['dashboard', 'consultazione', 'nonConformita'],
  },
  {
    id: 'u04',
    name: 'Elena Marchetti',
    roleId: 'responsabile_spedizioni',
    roleLabel: 'Responsabile Spedizioni',
    code: 'RESP-SPED-04',
    group: 'Ruoli operativi',
    views: ['dashboard', 'consultazione', 'spedizioni'],
  },
  {
    id: 'u05',
    name: 'Andrea Ferri',
    roleId: 'direzione',
    roleLabel: 'Direzione',
    code: 'DIR-05',
    group: 'Ruoli operativi',
    views: ['dashboard', 'consultazione'],
  },
  {
    id: 'u06',
    name: 'Amministratore di sistema',
    roleId: 'admin',
    roleLabel: 'Amministratore',
    code: 'ADMIN-00',
    group: 'Amministrazione',
    views: Object.keys(VIEWS),
  },
];

const PRODOTTI = [
  'Sugo al pomodoro classico',
  'Sugo alla bolognese',
  'Crema di funghi porcini',
  'Crema di zucca',
];

// Materie prime di default per prodotto: pre-compilano il campo alla
// selezione, restano comunque liberamente modificabili dall'operatore.
const MATERIE_PRIME_DEFAULT = {
  'Sugo al pomodoro classico': 'Pomodoro, Olio extravergine, Basilico, Sale',
  'Sugo alla bolognese': 'Pomodoro, Carne di manzo, Cipolla, Carota, Sedano, Olio extravergine, Sale',
  'Crema di funghi porcini': 'Funghi porcini, Panna, Burro, Cipolla, Sale, Pepe',
  'Crema di zucca': 'Zucca, Patata, Cipolla, Olio extravergine, Sale, Noce moscata',
};

const CONTROLLI_DISPONIBILI = [
  'Controllo organolettico',
  'Controllo peso/volume',
  'Controllo microbiologico',
  'Controllo etichettatura',
];

const STATI = {
  IN_PRODUZIONE: { id: 'IN_PRODUZIONE', label: 'In produzione', tone: 'info' },
  IN_ATTESA_DI_CONTROLLO: { id: 'IN_ATTESA_DI_CONTROLLO', label: 'In attesa di controllo', tone: 'info' },
  CONFORME: { id: 'CONFORME', label: 'Conforme', tone: 'ok' },
  BLOCCATO_PER_VERIFICA: { id: 'BLOCCATO_PER_VERIFICA', label: 'Bloccato per verifica', tone: 'warn' },
  NON_CONFORME_ESCLUSO: { id: 'NON_CONFORME_ESCLUSO', label: 'Non conforme, escluso', tone: 'danger' },
  SPEDITO: { id: 'SPEDITO', label: 'Spedito', tone: 'ok' },
};

// Autorizzazione applicata anche a livello di logica, non solo nascondendo
// i pulsanti: ogni funzione che modifica un lotto verifica il ruolo di chi
// la invoca. In un sistema reale lo stesso controllo andrebbe ripetuto
// lato server, qui rappresenta l'equivalente applicativo nel solo frontend.
const CLIENTI = [
  'GDO Adriatica S.p.A.',
  'Mercato Centrale Marche',
  'Distribuzione Sud Est',
  'Cooperativa Alimentare Conero',
];

const PERMESSI_AZIONE = {
  creaLotto: ['operatore_produzione', 'admin'],
  concludiLotto: ['operatore_produzione', 'admin'],
  registraEsitoControllo: ['addetto_qualita', 'admin'],
  verificaNonConformita: ['responsabile_qualita', 'admin'],
  registraSpedizione: ['responsabile_spedizioni', 'admin'],
  esportaBackup: ['admin'],
};

function isAutorizzato(user, azione) {
  const consentiti = PERMESSI_AZIONE[azione];
  return Boolean(consentiti && user && consentiti.includes(user.roleId));
}

/* ---------- Wrapper di sicurezza su localStorage ---------- */
const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('Storage non disponibile in lettura:', err);
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Storage non disponibile in scrittura:', err);
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('Storage non disponibile in rimozione:', err);
    }
  },
};

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- Feedback di validazione visibile sui campi ---------- */
function showFieldError(input, message) {
  clearFieldError(input);
  input.classList.add('input-error');
  const msg = document.createElement('p');
  msg.className = 'field-error-message';
  msg.textContent = message;
  input.insertAdjacentElement('afterend', msg);
  input.focus();
}

function clearFieldError(input) {
  input.classList.remove('input-error');
  const next = input.nextElementSibling;
  if (next && next.classList.contains('field-error-message')) {
    next.remove();
  }
}

/* ---------- Sessione ---------- */
function getSession() {
  const session = storage.get(SESSION_KEY);
  if (!session || !session.userId) return null;
  const user = DEMO_USERS.find((u) => u.id === session.userId);
  return user ? { ...user, loggedAt: session.loggedAt } : null;
}

function login(userId) {
  const user = DEMO_USERS.find((u) => u.id === userId);
  if (!user) return false;
  return storage.set(SESSION_KEY, { userId: user.id, loggedAt: new Date().toISOString() });
}

function logout() {
  storage.remove(SESSION_KEY);
}

/* ---------- Anagrafica lotti ---------- */
function loadLots() {
  return storage.get(LOTS_KEY) || [];
}

function saveLots(lots) {
  storage.set(LOTS_KEY, lots);
}

function generateCodiceLotto(dataProduzione, lots) {
  const giorno = dataProduzione.replaceAll('-', '');
  const contatore = lots.filter((l) => l.dataProduzione === dataProduzione).length + 1;
  return `GL-${giorno}-${String(contatore).padStart(3, '0')}`;
}

function creaLotto({ prodotto, dataProduzione, materiePrime, controlliPrevisti }, user) {
  if (!isAutorizzato(user, 'creaLotto')) {
    console.warn('Azione non autorizzata per il ruolo corrente.');
    return null;
  }
  const lots = loadLots();
  const lotto = {
    codice: generateCodiceLotto(dataProduzione, lots),
    prodotto,
    dataProduzione,
    quantitaProdotta: null,
    materiePrime,
    controlliPrevisti,
    stato: STATI.IN_PRODUZIONE.id,
    storicoControlli: [],
    storicoVerifiche: [],
    spedizione: null,
    creatoDa: user.code,
    creatoIl: new Date().toISOString(),
  };
  lots.push(lotto);
  saveLots(lots);
  return lotto;
}

function concludiLotto(codice, quantitaProdotta, user) {
  if (!isAutorizzato(user, 'concludiLotto')) {
    console.warn('Azione non autorizzata per il ruolo corrente.');
    return null;
  }
  const lots = loadLots();
  const lotto = lots.find((l) => l.codice === codice);
  if (!lotto || lotto.stato !== STATI.IN_PRODUZIONE.id) return null;
  lotto.quantitaProdotta = quantitaProdotta;
  lotto.stato = STATI.IN_ATTESA_DI_CONTROLLO.id;
  lotto.concluso = { autore: user.code, timestamp: new Date().toISOString() };
  saveLots(lots);
  return lotto;
}

function registraEsitoControllo(codice, esito, anomalia, tipoAnomalia, user) {
  if (!isAutorizzato(user, 'registraEsitoControllo')) {
    console.warn('Azione non autorizzata per il ruolo corrente.');
    return null;
  }
  const lots = loadLots();
  const lotto = lots.find((l) => l.codice === codice);
  if (!lotto || lotto.stato !== STATI.IN_ATTESA_DI_CONTROLLO.id) return null;

  // Ogni esito si accoda allo storico: una correzione successiva non
  // sovrascrive la voce precedente, resta tracciabile chi ha scritto cosa.
  // tipoAnomalia non introduce un esito per singolo controllo (resta uno
  // solo per lotto), serve solo a classificare l'anomalia per la dashboard.
  lotto.storicoControlli.push({
    esito,
    anomalia: esito === 'non_conforme' ? anomalia : null,
    tipoAnomalia: esito === 'non_conforme' ? tipoAnomalia : null,
    autore: user.code,
    timestamp: new Date().toISOString(),
  });
  lotto.stato = esito === 'conforme' ? STATI.CONFORME.id : STATI.BLOCCATO_PER_VERIFICA.id;
  saveLots(lots);
  return lotto;
}

function verificaNonConformita(codice, decisione, note, user) {
  if (!isAutorizzato(user, 'verificaNonConformita')) {
    console.warn('Azione non autorizzata per il ruolo corrente.');
    return null;
  }
  const lots = loadLots();
  const lotto = lots.find((l) => l.codice === codice);
  if (!lotto || lotto.stato !== STATI.BLOCCATO_PER_VERIFICA.id) return null;

  lotto.storicoVerifiche.push({
    decisione,
    note: note || null,
    autore: user.code,
    timestamp: new Date().toISOString(),
  });
  lotto.stato = decisione === 'risolto' ? STATI.CONFORME.id : STATI.NON_CONFORME_ESCLUSO.id;
  saveLots(lots);
  return lotto;
}

function registraSpedizione(codice, cliente, dataSpedizione, quantitaSpedita, user) {
  if (!isAutorizzato(user, 'registraSpedizione')) {
    console.warn('Azione non autorizzata per il ruolo corrente.');
    return null;
  }
  const lots = loadLots();
  const lotto = lots.find((l) => l.codice === codice);
  // Vincolo esplicito: spedibile solo se conforme, verificato di nuovo qui
  // anche se la UI mostra gia' solo i lotti in questo stato.
  if (!lotto || lotto.stato !== STATI.CONFORME.id) return null;

  lotto.spedizione = {
    cliente,
    dataSpedizione,
    quantitaSpedita,
    autore: user.code,
    timestamp: new Date().toISOString(),
  };
  lotto.stato = STATI.SPEDITO.id;
  saveLots(lots);
  return lotto;
}

function ultimaAnomalia(lotto) {
  const ultima = lotto.storicoControlli[lotto.storicoControlli.length - 1];
  return ultima?.anomalia || 'non specificata';
}

function formatTimestamp(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  } catch (err) {
    return iso;
  }
}

function filtraLotti(lots, query, statoFiltro) {
  const q = query.trim().toLowerCase();
  return lots.filter((l) => {
    const matchQuery = !q || l.codice.toLowerCase().includes(q) || l.prodotto.toLowerCase().includes(q);
    const matchStato = !statoFiltro || l.stato === statoFiltro;
    return matchQuery && matchStato;
  });
}

/* ---------- Backup ---------- */
function esportaBackup(user) {
  if (!isAutorizzato(user, 'esportaBackup')) return;
  const payload = {
    lotti: loadLots(),
    esportatoIl: new Date().toISOString(),
    esportatoDa: user.code,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gustolinea-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------- Render: schermata di accesso ---------- */
function renderLogin(root) {
  const gruppi = ['Ruoli operativi', 'Amministrazione'];

  root.innerHTML = `
    <main class="login-screen">
      <section class="badge-card" aria-labelledby="login-title">
        <span class="eyebrow">GustoLinea &middot; Controllo Lotti</span>
        <h1 id="login-title" class="title">Ingresso turno</h1>
        <p class="subtitle">Seleziona il profilo per accedere alle funzioni abilitate per il tuo ruolo.</p>
        <form id="login-form" novalidate>
          <label class="field-label" for="user-select">Utente</label>
          <select id="user-select" name="user" required>
            <option value="" disabled selected>Scegli un profilo...</option>
            ${gruppi
              .map(
                (gruppo) => `
              <optgroup label="${escapeHTML(gruppo)}">
                ${DEMO_USERS.filter((u) => u.group === gruppo)
                  .map(
                    (u) =>
                      `<option value="${u.id}">${escapeHTML(u.name)} &middot; ${escapeHTML(u.roleLabel)}</option>`
                  )
                  .join('')}
              </optgroup>`
              )
              .join('')}
          </select>

          <div class="badge-preview" id="badge-preview" aria-live="polite">
            <span class="badge-preview-hint">Anteprima badge</span>
            <span class="badge-preview-code" id="badge-preview-code">In attesa di selezione</span>
          </div>

          <button type="submit" class="btn-primary" id="login-submit" disabled>Accedi</button>
        </form>
      </section>
    </main>
  `;

  const select = root.querySelector('#user-select');
  const previewBox = root.querySelector('#badge-preview');
  const previewCode = root.querySelector('#badge-preview-code');
  const submitBtn = root.querySelector('#login-submit');

  select.addEventListener('change', () => {
    const user = DEMO_USERS.find((u) => u.id === select.value);
    if (!user) {
      previewCode.textContent = 'In attesa di selezione';
      submitBtn.disabled = true;
      return;
    }
    previewCode.textContent = `${user.code} \u00b7 ${user.roleLabel}`;
    submitBtn.disabled = false;
    previewBox.classList.remove('stamped');
    void previewBox.offsetWidth;
    previewBox.classList.add('stamped');
  });

  root.querySelector('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!select.value) return;
    login(select.value);
    renderApp(root);
  });
}

/* ---------- Render: shell applicativa post login ---------- */
const VIEW_RENDERERS = {
  dashboard: renderDashboardView,
  produzione: renderProduzioneView,
  controlliQualita: renderControlliQualitaView,
  nonConformita: renderNonConformitaView,
  spedizioni: renderSpedizioniView,
  consultazione: renderConsultazioneView,
};

// Codice del lotto su cui e' aperto un form di azione (conclusione, esito,
// verifica). Una sola riga puo' essere "espansa" alla volta per vista.
let activeRowAction = null;

// Periodo selezionato in dashboard e ricerca in sospeso quando si salta
// dalla dashboard alla consultazione lotti (ricerca rapida, RF15).
let periodoDashboard = 'tutto';
let pendingConsultazioneQuery = '';

function renderApp(root) {
  const user = getSession();
  if (!user) {
    renderLogin(root);
    return;
  }

  const navItems = user.views.map((viewId) => VIEWS[viewId]).filter(Boolean);
  const firstView = navItems[0];

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="app-header-id">
          <span class="eyebrow">GustoLinea &middot; Controllo Lotti</span>
          <span class="user-badge">${escapeHTML(user.code)} &middot; ${escapeHTML(user.name)} &middot; ${escapeHTML(user.roleLabel)}</span>
        </div>
        <div class="app-header-actions">
          ${isAutorizzato(user, 'esportaBackup') ? `<button class="btn-ghost" id="backup-btn" type="button">Esporta backup</button>` : ''}
          <button class="btn-ghost" id="logout-btn" type="button">Esci</button>
        </div>
      </header>

      <nav class="app-nav" aria-label="Sezioni disponibili per il ruolo">
        ${navItems
          .map(
            (view, i) =>
              `<button class="nav-btn${i === 0 ? ' active' : ''}" data-view="${view.id}" type="button">${escapeHTML(view.label)}</button>`
          )
          .join('')}
      </nav>

      <main class="app-content" id="app-content"></main>
    </div>
  `;

  root.querySelector('#logout-btn').addEventListener('click', () => {
    logout();
    renderLogin(root);
  });

  const backupBtn = root.querySelector('#backup-btn');
  if (backupBtn) {
    backupBtn.addEventListener('click', () => esportaBackup(user));
  }

  root.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeRowAction = null;
      renderView(root, user, VIEWS[btn.dataset.view]);
    });
  });

  renderView(root, user, firstView);
}

function renderView(root, user, view) {
  const content = root.querySelector('#app-content');
  if (!view) {
    content.innerHTML = '';
    return;
  }
  const renderer = VIEW_RENDERERS[view.id];
  if (renderer) {
    renderer(content, user, root);
  } else {
    content.innerHTML = `<p class="placeholder-note">Sezione "${escapeHTML(view.label)}" in costruzione nei prossimi passaggi del progetto.</p>`;
  }
}

/* ---------- Componenti tabella lotti riutilizzabili ---------- */
function renderLotsTable(lots, actionLabel, extraColumn) {
  if (lots.length === 0) {
    return `<p class="placeholder-note">Nessun lotto in questo stato al momento.</p>`;
  }
  return `
    <table class="lots-table">
      <thead>
        <tr>
          <th>Codice</th><th>Prodotto</th><th>Data</th><th>Stato</th>
          ${extraColumn ? `<th>${escapeHTML(extraColumn.header)}</th>` : ''}
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${lots
          .map(
            (l) => `
          <tr>
            <td class="mono">${escapeHTML(l.codice)}</td>
            <td>${escapeHTML(l.prodotto)}</td>
            <td>${escapeHTML(l.dataProduzione)}</td>
            <td>${renderStatoBadge(l.stato)}</td>
            ${extraColumn ? `<td>${escapeHTML(extraColumn.value(l))}</td>` : ''}
            <td><button class="btn-ghost btn-row-action" data-codice="${escapeHTML(l.codice)}" type="button">${escapeHTML(actionLabel)}</button></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderStatoBadge(statoId) {
  const stato = STATI[statoId];
  if (!stato) return '';
  return `<span class="status-badge status-${stato.tone}">${escapeHTML(stato.label)}</span>`;
}

function attachRowActionHandlers(content, onSelect) {
  content.querySelectorAll('.btn-row-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRowAction = btn.dataset.codice;
      onSelect();
    });
  });
}

/* ---------- Vista: avvio/fine produzione ---------- */
function renderProduzioneView(content, user, root) {
  const lots = loadLots();
  const inProduzione = lots.filter((l) => l.stato === STATI.IN_PRODUZIONE.id);

  content.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Registra avvio nuovo lotto</h2>
      <form id="form-avvio" novalidate>
        <div class="form-row">
          <div class="form-field">
            <label class="field-label" for="prodotto">Prodotto</label>
            <select id="prodotto" required>
              <option value="" disabled selected>Scegli prodotto...</option>
              ${PRODOTTI.map((p) => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="field-label" for="data-produzione">Data produzione</label>
            <input type="date" id="data-produzione" required value="${todayISO()}">
          </div>
        </div>

        <div class="form-field">
          <label class="field-label" for="materie-prime">Materie prime / ingredienti principali</label>
          <input type="text" id="materie-prime" placeholder="es. Pomodoro, Olio extravergine, Basilico, Sale" required>
        </div>

        <div class="form-field">
          <label class="field-label">Controlli qualità previsti</label>
          <div class="checklist">
            ${CONTROLLI_DISPONIBILI.map(
              (c) => `
              <label class="checklist-item">
                <input type="checkbox" name="controlli" value="${escapeHTML(c)}">
                ${escapeHTML(c)}
              </label>`
            ).join('')}
          </div>
        </div>

        <button type="submit" class="btn-primary">Registra avvio lotto</button>
      </form>
    </section>

    <section class="panel">
      <h2 class="panel-title">Lotti in produzione, in attesa di conclusione</h2>
      <div id="lots-list">${renderLotsInProduzione(inProduzione, activeRowAction)}</div>
    </section>
  `;

  content.querySelector('#prodotto').addEventListener('change', (event) => {
    const materieInput = content.querySelector('#materie-prime');
    const defaultIngredienti = MATERIE_PRIME_DEFAULT[event.target.value];
    if (defaultIngredienti) {
      materieInput.value = defaultIngredienti;
    }
    clearFieldError(event.target);
    clearFieldError(materieInput);
  });

  ['#data-produzione', '#materie-prime'].forEach((selector) => {
    const field = content.querySelector(selector);
    field.addEventListener('input', () => clearFieldError(field));
  });

  content.querySelector('#form-avvio').addEventListener('submit', (event) => {
    event.preventDefault();
    const prodottoSelect = content.querySelector('#prodotto');
    const dataInput = content.querySelector('#data-produzione');
    const materieInput = content.querySelector('#materie-prime');

    if (!prodottoSelect.value) {
      showFieldError(prodottoSelect, 'Seleziona un prodotto.');
      return;
    }
    if (!dataInput.value) {
      showFieldError(dataInput, 'Indica la data di produzione.');
      return;
    }
    if (!materieInput.value.trim()) {
      showFieldError(materieInput, 'Indica almeno una materia prima.');
      return;
    }

    const controlliPrevisti = Array.from(content.querySelectorAll('input[name="controlli"]:checked')).map(
      (cb) => cb.value
    );
    const materiePrime = materieInput.value
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    const creato = creaLotto(
      { prodotto: prodottoSelect.value, dataProduzione: dataInput.value, materiePrime, controlliPrevisti },
      user
    );
    if (!creato) return;
    renderProduzioneView(content, user, root);
  });

  attachConclusioneHandlers(content, user, root);
}

function renderLotsInProduzione(lots, activeCode) {
  if (lots.length === 0) {
    return `<p class="placeholder-note">Nessun lotto in produzione al momento.</p>`;
  }
  return `
    <table class="lots-table">
      <thead>
        <tr><th>Codice</th><th>Prodotto</th><th>Data</th><th>Stato</th><th></th></tr>
      </thead>
      <tbody>
        ${lots
          .map(
            (l) => `
          <tr>
            <td class="mono">${escapeHTML(l.codice)}</td>
            <td>${escapeHTML(l.prodotto)}</td>
            <td>${escapeHTML(l.dataProduzione)}</td>
            <td>${renderStatoBadge(l.stato)}</td>
            <td>${renderConclusioneCell(l, activeCode)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderConclusioneCell(lotto, activeCode) {
  if (activeCode === lotto.codice) {
    return `
      <form class="inline-form" data-codice="${escapeHTML(lotto.codice)}">
        <input type="number" min="0.1" step="0.1" class="qty-input" placeholder="kg" aria-label="Quantità prodotta in kg" required>
        <button type="submit" class="btn-primary btn-sm">Confirma</button>
        <button type="button" class="btn-ghost btn-sm btn-cancel-conclude">Annulla</button>
      </form>
    `;
  }
  return `<button class="btn-ghost btn-conclude" data-codice="${escapeHTML(lotto.codice)}" type="button">Concludi produzione</button>`;
}

function attachConclusioneHandlers(content, user, root) {
  content.querySelectorAll('.btn-conclude').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRowAction = btn.dataset.codice;
      renderProduzioneView(content, user, root);
    });
  });

  content.querySelectorAll('.btn-cancel-conclude').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRowAction = null;
      renderProduzioneView(content, user, root);
    });
  });

  content.querySelectorAll('.inline-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const codice = form.dataset.codice;
      const input = form.querySelector('.qty-input');
      const quantita = Number(input.value);
      if (!Number.isFinite(quantita) || quantita <= 0) {
        showFieldError(input, 'Indica una quantità numerica maggiore di zero.');
        return;
      }
      concludiLotto(codice, quantita, user);
      activeRowAction = null;
      renderProduzioneView(content, user, root);
    });
  });
}

/* ---------- Vista: esito controllo qualità ---------- */
function renderControlliQualitaView(content, user, root) {
  const lots = loadLots();
  const inAttesa = lots.filter((l) => l.stato === STATI.IN_ATTESA_DI_CONTROLLO.id);
  const selezionato = inAttesa.find((l) => l.codice === activeRowAction) || null;

  content.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Lotti in attesa di controllo</h2>
      ${renderLotsTable(inAttesa, 'Registra esito')}
    </section>
    ${selezionato ? renderEsitoForm(selezionato) : ''}
  `;

  attachRowActionHandlers(content, () => renderControlliQualitaView(content, user, root));

  if (!selezionato) return;

  content.querySelector('#esito-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const esito = content.querySelector('#esito-select').value;
    const anomaliaInput = content.querySelector('#anomalia-text');
    const tipoAnomaliaSelect = content.querySelector('#tipo-anomalia-select');
    const anomalia = anomaliaInput.value.trim();
    const tipoAnomalia = tipoAnomaliaSelect.value;

    if (esito === 'non_conforme' && !anomalia) {
      showFieldError(anomaliaInput, "Descrivi l'anomalia rilevata per un esito non conforme.");
      return;
    }
    if (esito === 'non_conforme' && !tipoAnomalia) {
      showFieldError(tipoAnomaliaSelect, 'Indica quale tipologia di controllo ha rilevato l\'anomalia.');
      return;
    }

    registraEsitoControllo(selezionato.codice, esito, anomalia || null, tipoAnomalia || null, user);
    activeRowAction = null;
    renderControlliQualitaView(content, user, root);
  });

  content.querySelector('#cancel-action').addEventListener('click', () => {
    activeRowAction = null;
    renderControlliQualitaView(content, user, root);
  });
}

function renderEsitoForm(lotto) {
  return `
    <section class="panel">
      <h2 class="panel-title">Registra esito controllo, lotto ${escapeHTML(lotto.codice)}</h2>
      <p class="placeholder-note">Controlli previsti: ${escapeHTML(lotto.controlliPrevisti.join(', ') || 'nessuno specificato')}</p>
      <form id="esito-form" novalidate>
        <div class="form-field">
          <label class="field-label" for="esito-select">Esito complessivo</label>
          <select id="esito-select" required>
            <option value="conforme">Conforme</option>
            <option value="non_conforme">Non conforme</option>
          </select>
        </div>
        <div class="form-field">
          <label class="field-label" for="anomalia-text">Anomalia rilevata (obbligatoria se non conforme)</label>
          <input type="text" id="anomalia-text" placeholder="Descrivi l'anomalia osservata">
        </div>
        <div class="form-field">
          <label class="field-label" for="tipo-anomalia-select">Tipologia di controllo che ha rilevato l'anomalia (se non conforme)</label>
          <select id="tipo-anomalia-select">
            <option value="">Non applicabile</option>
            ${CONTROLLI_DISPONIBILI.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
          </select>
        </div>
        <div class="inline-form">
          <button type="submit" class="btn-primary btn-sm">Registra esito</button>
          <button type="button" class="btn-ghost btn-sm" id="cancel-action">Annulla</button>
        </div>
      </form>
    </section>
  `;
}

/* ---------- Vista: verifiche e non conformità ---------- */
function renderNonConformitaView(content, user, root) {
  const lots = loadLots();
  const bloccati = lots.filter((l) => l.stato === STATI.BLOCCATO_PER_VERIFICA.id);
  const selezionato = bloccati.find((l) => l.codice === activeRowAction) || null;

  content.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Lotti bloccati per verifica</h2>
      ${renderLotsTable(bloccati, 'Verifica', { header: 'Ultima anomalia', value: ultimaAnomalia })}
    </section>
    ${selezionato ? renderVerificaForm(selezionato) : ''}
  `;

  attachRowActionHandlers(content, () => renderNonConformitaView(content, user, root));

  if (!selezionato) return;

  content.querySelector('#verifica-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const decisione = content.querySelector('#decisione-select').value;
    const note = content.querySelector('#note-verifica').value.trim();
    verificaNonConformita(selezionato.codice, decisione, note, user);
    activeRowAction = null;
    renderNonConformitaView(content, user, root);
  });

  content.querySelector('#cancel-action').addEventListener('click', () => {
    activeRowAction = null;
    renderNonConformitaView(content, user, root);
  });
}

function renderVerificaForm(lotto) {
  return `
    <section class="panel">
      <h2 class="panel-title">Verifica non conformità, lotto ${escapeHTML(lotto.codice)}</h2>
      <p class="placeholder-note">Anomalia rilevata: ${escapeHTML(ultimaAnomalia(lotto))}</p>
      <form id="verifica-form" novalidate>
        <div class="form-field">
          <label class="field-label" for="decisione-select">Decisione</label>
          <select id="decisione-select" required>
            <option value="risolto">Risolto, dichiara conforme</option>
            <option value="escluso">Confermo non conformità, escludi da spedizione</option>
          </select>
        </div>
        <div class="form-field">
          <label class="field-label" for="note-verifica">Note di verifica</label>
          <input type="text" id="note-verifica" placeholder="es. esito ripetuto controllo, motivazione decisione">
        </div>
        <div class="inline-form">
          <button type="submit" class="btn-primary btn-sm">Conferma decisione</button>
          <button type="button" class="btn-ghost btn-sm" id="cancel-action">Annulla</button>
        </div>
      </form>
    </section>
  `;
}

/* ---------- Vista: registrazione spedizione ---------- */
function renderSpedizioniView(content, user, root) {
  const lots = loadLots();
  const conformi = lots.filter((l) => l.stato === STATI.CONFORME.id);
  const speditiRecenti = lots
    .filter((l) => l.stato === STATI.SPEDITO.id)
    .sort((a, b) => new Date(b.spedizione.timestamp) - new Date(a.spedizione.timestamp))
    .slice(0, 5);
  const selezionato = conformi.find((l) => l.codice === activeRowAction) || null;

  content.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Lotti conformi, pronti per la spedizione</h2>
      ${renderLotsTable(conformi, 'Registra spedizione')}
    </section>
    ${selezionato ? renderSpedizioneForm(selezionato) : ''}
    <section class="panel">
      <h2 class="panel-title">Ultime spedizioni registrate</h2>
      ${renderSpedizioniRecenti(speditiRecenti)}
    </section>
  `;

  attachRowActionHandlers(content, () => renderSpedizioniView(content, user, root));

  if (!selezionato) return;

  ['#cliente-select', '#data-spedizione', '#quantita-spedita'].forEach((selector) => {
    const field = content.querySelector(selector);
    field.addEventListener('input', () => clearFieldError(field));
    field.addEventListener('change', () => clearFieldError(field));
  });

  content.querySelector('#spedizione-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const clienteSelect = content.querySelector('#cliente-select');
    const dataInput = content.querySelector('#data-spedizione');
    const quantitaInput = content.querySelector('#quantita-spedita');

    if (!clienteSelect.value) {
      showFieldError(clienteSelect, 'Seleziona un cliente.');
      return;
    }
    if (!dataInput.value) {
      showFieldError(dataInput, 'Indica la data di spedizione.');
      return;
    }
    const quantita = Number(quantitaInput.value);
    if (!Number.isFinite(quantita) || quantita <= 0) {
      showFieldError(quantitaInput, 'Indica una quantità numerica maggiore di zero.');
      return;
    }

    registraSpedizione(selezionato.codice, clienteSelect.value, dataInput.value, quantita, user);
    activeRowAction = null;
    renderSpedizioniView(content, user, root);
  });

  content.querySelector('#cancel-action').addEventListener('click', () => {
    activeRowAction = null;
    renderSpedizioniView(content, user, root);
  });
}

function renderSpedizioneForm(lotto) {
  return `
    <section class="panel">
      <h2 class="panel-title">Registra spedizione, lotto ${escapeHTML(lotto.codice)}</h2>
      <form id="spedizione-form" novalidate>
        <div class="form-row">
          <div class="form-field">
            <label class="field-label" for="cliente-select">Cliente</label>
            <select id="cliente-select" required>
              <option value="" disabled selected>Scegli cliente...</option>
              ${CLIENTI.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="field-label" for="data-spedizione">Data spedizione</label>
            <input type="date" id="data-spedizione" required value="${todayISO()}">
          </div>
        </div>
        <div class="form-field">
          <label class="field-label" for="quantita-spedita">Quantità spedita (kg)</label>
          <input type="number" id="quantita-spedita" min="0.1" step="0.1" required value="${lotto.quantitaProdotta ?? ''}">
        </div>
        <div class="inline-form">
          <button type="submit" class="btn-primary btn-sm">Registra spedizione</button>
          <button type="button" class="btn-ghost btn-sm" id="cancel-action">Annulla</button>
        </div>
      </form>
    </section>
  `;
}

function renderSpedizioniRecenti(lots) {
  if (lots.length === 0) {
    return `<p class="placeholder-note">Nessuna spedizione registrata finora.</p>`;
  }
  return `
    <table class="lots-table">
      <thead>
        <tr><th>Codice</th><th>Prodotto</th><th>Cliente</th><th>Data spedizione</th><th>Quantità</th></tr>
      </thead>
      <tbody>
        ${lots
          .map(
            (l) => `
          <tr>
            <td class="mono">${escapeHTML(l.codice)}</td>
            <td>${escapeHTML(l.prodotto)}</td>
            <td>${escapeHTML(l.spedizione.cliente)}</td>
            <td>${escapeHTML(l.spedizione.dataSpedizione)}</td>
            <td>${escapeHTML(String(l.spedizione.quantitaSpedita))} kg</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

/* ---------- Vista: consultazione lotti ---------- */
function renderConsultazioneView(content, user, root) {
  const queryIniziale = pendingConsultazioneQuery;
  pendingConsultazioneQuery = '';

  content.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Ricerca lotti</h2>
      <div class="form-row">
        <div class="form-field">
          <label class="field-label" for="ricerca-codice">Cerca per codice o prodotto</label>
          <input type="text" id="ricerca-codice" placeholder="es. GL-20260625 oppure Sugo" value="${escapeHTML(queryIniziale)}">
        </div>
        <div class="form-field">
          <label class="field-label" for="filtro-stato">Filtra per stato</label>
          <select id="filtro-stato">
            <option value="">Tutti gli stati</option>
            ${Object.values(STATI)
              .map((s) => `<option value="${s.id}">${escapeHTML(s.label)}</option>`)
              .join('')}
          </select>
        </div>
      </div>
    </section>
    <section class="panel">
      <h2 class="panel-title">Risultati</h2>
      <div id="consultazione-results"></div>
    </section>
    <div id="consultazione-dettaglio"></div>
  `;

  const ricercaInput = content.querySelector('#ricerca-codice');
  const filtroSelect = content.querySelector('#filtro-stato');

  function aggiornaRisultati() {
    const filtrati = filtraLotti(loadLots(), ricercaInput.value, filtroSelect.value);
    content.querySelector('#consultazione-results').innerHTML = renderLotsTable(filtrati, 'Dettagli');
    attachRowActionHandlers(content, () => mostraDettaglio(content));
  }

  ricercaInput.addEventListener('input', aggiornaRisultati);
  filtroSelect.addEventListener('change', aggiornaRisultati);

  aggiornaRisultati();
}

function mostraDettaglio(content) {
  const dettContainer = content.querySelector('#consultazione-dettaglio');
  const lotto = loadLots().find((l) => l.codice === activeRowAction);
  dettContainer.innerHTML = renderDettaglioLotto(lotto);
  const chiudiBtn = dettContainer.querySelector('#chiudi-dettaglio');
  if (chiudiBtn) {
    chiudiBtn.addEventListener('click', () => {
      activeRowAction = null;
      dettContainer.innerHTML = '';
    });
  }
}

function renderDettaglioLotto(lotto) {
  if (!lotto) return '';
  return `
    <section class="panel">
      <h2 class="panel-title">Dettaglio lotto ${escapeHTML(lotto.codice)}</h2>
      <p class="placeholder-note">${escapeHTML(lotto.prodotto)}, prodotto il ${escapeHTML(lotto.dataProduzione)}. Stato attuale: ${renderStatoBadge(lotto.stato)}</p>
      <p class="placeholder-note">Quantità prodotta: ${
        lotto.quantitaProdotta != null ? `${escapeHTML(String(lotto.quantitaProdotta))} kg` : 'non ancora conclusa'
      }</p>
      <p class="placeholder-note">Materie prime: ${escapeHTML(lotto.materiePrime.join(', ') || 'non specificate')}</p>

      <h3 class="detail-subtitle">Storico controlli qualità</h3>
      ${renderStoricoControlli(lotto.storicoControlli)}

      <h3 class="detail-subtitle">Storico verifiche non conformità</h3>
      ${renderStoricoVerifiche(lotto.storicoVerifiche)}

      <h3 class="detail-subtitle">Spedizione</h3>
      ${renderDettaglioSpedizione(lotto.spedizione)}

      <button class="btn-ghost btn-sm" id="chiudi-dettaglio" type="button">Chiudi dettaglio</button>
    </section>
  `;
}

function renderStoricoControlli(storico) {
  if (!storico || storico.length === 0) {
    return `<p class="placeholder-note">Nessun controllo registrato finora.</p>`;
  }
  return `
    <ul class="storico-list">
      ${storico
        .map(
          (voce) => `
        <li>
          <span class="status-badge status-${voce.esito === 'conforme' ? 'ok' : 'warn'}">${
            voce.esito === 'conforme' ? 'Conforme' : 'Non conforme'
          }</span>
          ${
            voce.anomalia
              ? `<span class="storico-detail">${escapeHTML(
                  (voce.tipoAnomalia ? `${voce.tipoAnomalia}: ` : '') + voce.anomalia
                )}</span>`
              : ''
          }
          <span class="storico-meta">${escapeHTML(voce.autore)} &middot; ${escapeHTML(formatTimestamp(voce.timestamp))}</span>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function renderStoricoVerifiche(storico) {
  if (!storico || storico.length === 0) {
    return `<p class="placeholder-note">Nessuna verifica registrata.</p>`;
  }
  return `
    <ul class="storico-list">
      ${storico
        .map(
          (voce) => `
        <li>
          <span class="status-badge status-${voce.decisione === 'risolto' ? 'ok' : 'danger'}">${
            voce.decisione === 'risolto' ? 'Risolto' : 'Escluso'
          }</span>
          ${voce.note ? `<span class="storico-detail">${escapeHTML(voce.note)}</span>` : ''}
          <span class="storico-meta">${escapeHTML(voce.autore)} &middot; ${escapeHTML(formatTimestamp(voce.timestamp))}</span>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function renderDettaglioSpedizione(spedizione) {
  if (!spedizione) {
    return `<p class="placeholder-note">Non ancora spedito.</p>`;
  }
  return `
    <p class="placeholder-note">
      Cliente: ${escapeHTML(spedizione.cliente)}, il ${escapeHTML(spedizione.dataSpedizione)}, ${escapeHTML(
    String(spedizione.quantitaSpedita)
  )} kg. Registrato da ${escapeHTML(spedizione.autore)} il ${escapeHTML(formatTimestamp(spedizione.timestamp))}.
    </p>
  `;
}

/* ---------- Vista: dashboard ---------- */
const PERIODI = [
  { id: 'oggi', label: 'Oggi' },
  { id: '7g', label: 'Ultimi 7 giorni' },
  { id: '30g', label: 'Ultimi 30 giorni' },
  { id: 'tutto', label: 'Tutto il periodo' },
];

function filtraPerPeriodo(lots, periodoId) {
  if (periodoId === 'tutto') return lots;
  const giorni = periodoId === 'oggi' ? 0 : periodoId === '7g' ? 7 : 30;
  const oggi = todayISO();
  const limiteDate = new Date();
  limiteDate.setDate(limiteDate.getDate() - giorni);
  const limite = limiteDate.toISOString().slice(0, 10);
  return lots.filter((l) => l.dataProduzione >= limite && l.dataProduzione <= oggi);
}

function calcolaIndicatori(lots) {
  const totale = lots.length;
  const inAttesa = lots.filter((l) => l.stato === STATI.IN_ATTESA_DI_CONTROLLO.id).length;
  const bloccati = lots.filter((l) => l.stato === STATI.BLOCCATO_PER_VERIFICA.id).length;

  const statiControllati = [STATI.CONFORME.id, STATI.BLOCCATO_PER_VERIFICA.id, STATI.NON_CONFORME_ESCLUSO.id, STATI.SPEDITO.id];
  const controllati = lots.filter((l) => statiControllati.includes(l.stato));
  const conformiOSpediti = controllati.filter((l) => l.stato === STATI.CONFORME.id || l.stato === STATI.SPEDITO.id);
  const percentualeConformi = controllati.length
    ? Math.round((conformiOSpediti.length / controllati.length) * 100)
    : null;

  const anomaliePerTipo = {};
  lots.forEach((l) => {
    l.storicoControlli.forEach((voce) => {
      if (voce.esito === 'non_conforme' && voce.tipoAnomalia) {
        anomaliePerTipo[voce.tipoAnomalia] = (anomaliePerTipo[voce.tipoAnomalia] || 0) + 1;
      }
    });
  });

  const ultimiControllati = lots
    .filter((l) => l.storicoControlli.length > 0)
    .map((l) => ({ lotto: l, ultimoControllo: l.storicoControlli[l.storicoControlli.length - 1] }))
    .sort((a, b) => new Date(b.ultimoControllo.timestamp) - new Date(a.ultimoControllo.timestamp))
    .slice(0, 5);

  const spediti = lots.filter((l) => l.stato === STATI.SPEDITO.id && l.spedizione);
  const leadTimes = spediti.map(
    (l) => (new Date(l.spedizione.timestamp) - new Date(l.creatoIl)) / (1000 * 60 * 60 * 24)
  );
  const leadTimeMedio = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null;

  return { totale, inAttesa, bloccati, percentualeConformi, anomaliePerTipo, ultimiControllati, leadTimeMedio };
}

function vaiAConsultazione(query, root) {
  pendingConsultazioneQuery = query;
  const navBtn = root.querySelector('.nav-btn[data-view="consultazione"]');
  if (navBtn) navBtn.click();
}

function renderDashboardView(content, user, root) {
  content.innerHTML = `
    <section class="panel">
      <div class="form-row">
        <div class="form-field">
          <label class="field-label" for="periodo-select">Periodo</label>
          <select id="periodo-select">
            ${PERIODI.map(
              (p) => `<option value="${p.id}"${p.id === periodoDashboard ? ' selected' : ''}>${escapeHTML(p.label)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="field-label" for="ricerca-rapida">Ricerca rapida per codice lotto</label>
          <input type="text" id="ricerca-rapida" placeholder="es. GL-20260625-001, invio per cercare">
        </div>
      </div>
    </section>
    <div id="dashboard-body"></div>
  `;

  content.querySelector('#periodo-select').addEventListener('change', (event) => {
    periodoDashboard = event.target.value;
    renderDashboardBody(content);
  });

  content.querySelector('#ricerca-rapida').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    vaiAConsultazione(event.target.value, root);
  });

  renderDashboardBody(content);
}

function renderDashboardBody(content) {
  const lots = filtraPerPeriodo(loadLots(), periodoDashboard);
  const k = calcolaIndicatori(lots);
  const periodoLabel = PERIODI.find((p) => p.id === periodoDashboard).label.toLowerCase();

  content.querySelector('#dashboard-body').innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Indicatori, ${escapeHTML(periodoLabel)}</h2>
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-value">${k.totale}</span><span class="kpi-label">Lotti prodotti</span></div>
        <div class="kpi-card"><span class="kpi-value">${k.inAttesa}</span><span class="kpi-label">In attesa di controllo</span></div>
        <div class="kpi-card"><span class="kpi-value">${k.bloccati}</span><span class="kpi-label">Bloccati per verifica</span></div>
        <div class="kpi-card"><span class="kpi-value">${k.percentualeConformi != null ? `${k.percentualeConformi}%` : 'N/D'}</span><span class="kpi-label">Lotti conformi</span></div>
        <div class="kpi-card"><span class="kpi-value">${k.leadTimeMedio != null ? k.leadTimeMedio.toFixed(1) : 'N/D'}</span><span class="kpi-label">Giorni medi a spedizione</span></div>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Anomalie per tipologia di controllo</h2>
      ${renderAnomaliePerTipo(k.anomaliePerTipo)}
    </section>

    <section class="panel">
      <h2 class="panel-title">Ultimi lotti controllati</h2>
      ${renderUltimiControllati(k.ultimiControllati)}
    </section>
  `;
}

function renderAnomaliePerTipo(mappa) {
  const voci = Object.entries(mappa);
  if (voci.length === 0) {
    return `<p class="placeholder-note">Nessuna anomalia registrata nel periodo selezionato.</p>`;
  }
  return `
    <ul class="storico-list">
      ${voci
        .map(
          ([tipo, conteggio]) => `
        <li>
          <span class="storico-detail">${escapeHTML(tipo)}</span>
          <span class="storico-meta">${conteggio} anomalia${conteggio === 1 ? '' : 'e'}</span>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function renderUltimiControllati(elenco) {
  if (elenco.length === 0) {
    return `<p class="placeholder-note">Nessun lotto controllato nel periodo selezionato.</p>`;
  }
  return `
    <table class="lots-table">
      <thead><tr><th>Codice</th><th>Prodotto</th><th>Ultimo esito</th><th>Quando</th></tr></thead>
      <tbody>
        ${elenco
          .map(
            ({ lotto, ultimoControllo }) => `
          <tr>
            <td class="mono">${escapeHTML(lotto.codice)}</td>
            <td>${escapeHTML(lotto.prodotto)}</td>
            <td><span class="status-badge status-${ultimoControllo.esito === 'conforme' ? 'ok' : 'warn'}">${
              ultimoControllo.esito === 'conforme' ? 'Conforme' : 'Non conforme'
            }</span></td>
            <td class="mono">${escapeHTML(formatTimestamp(ultimoControllo.timestamp))}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

/* ---------- Avvio ---------- */
function init() {
  const root = document.getElementById('app-root');
  const existing = getSession();
  if (existing) {
    renderApp(root);
  } else {
    renderLogin(root);
  }
}

document.addEventListener('DOMContentLoaded', init);
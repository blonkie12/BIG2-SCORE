(() => {
  "use strict";

  const config = window.BIG2_CONFIG || {};
  const QUALIFYING_GAMES = 10;
  const ADMIN_ACTOR_KEY = "__admin__";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    groupTitle: $("#group-title"), modeBanner: $("#mode-banner"), toast: $("#toast"),
    currentUserButton: $("#current-user-button"), refreshButton: $("#refresh-button"),
    totalGames: $("#total-games"), totalPlayers: $("#total-players"), leaderName: $("#leader-name"), leaderDetail: $("#leader-detail"),
    rankingBody: $("#ranking-body"), recentGames: $("#recent-games"), historyGames: $("#history-games"), logbookList: $("#logbook-list"),
    participantChips: $("#participant-chips"), winnerSelect: $("#winner-select"), enteredBySelect: $("#entered-by-select"),
    cardsFieldset: $("#cards-fieldset"), cardsInputs: $("#cards-inputs"), gameForm: $("#game-form"), gameNote: $("#game-note"),
    gameValidation: $("#game-validation"), exportButton: $("#export-button"),
    addPlayerForm: $("#add-player-form"), newPlayerNames: $("#new-player-names"), adminPlayerList: $("#admin-player-list"),
    identityDialog: $("#identity-dialog"), identityForm: $("#identity-form"), identitySelect: $("#identity-select"),
    confirmDialog: $("#confirm-dialog"), confirmTitle: $("#confirm-title"), confirmText: $("#confirm-text"),
    editGameDialog: $("#edit-game-dialog"), editGameForm: $("#edit-game-form"), editWinnerSelect: $("#edit-winner-select"),
    editCardsInputs: $("#edit-cards-inputs"), editGameNote: $("#edit-game-note"), editGameValidation: $("#edit-game-validation")
  };

  let state = { group: { name: "Big Two Vakantiestand" }, players: [], games: [], logs: [] };
  let selectedPlayers = new Set();
  let currentActorKey = "";
  let editingGameId = "";
  let backend;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const scorePenalty = (cards) => cards >= 13 ? 39 : cards >= 10 ? cards * 2 : cards;
  const maxCardsForPlayerCount = (playerCount) => Math.ceil(52 / Math.max(1, playerCount));
  const playerById = (id) => state.players.find((player) => player.id === id);
  const playerName = (id) => playerById(id)?.name || "Onbekend";
  const formatDate = (iso) => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const formatLogDate = (iso) => new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(new Date(iso));

  function normalizeState(next) {
    return {
      group: next?.group || { name: "Big Two Vakantiestand" },
      players: Array.isArray(next?.players) ? next.players : [],
      games: Array.isArray(next?.games) ? next.games : [],
      logs: Array.isArray(next?.logs) ? next.logs : []
    };
  }

  function actorStorageKey() {
    return `big2-current-actor:${state.group?.slug || config.groupSlug || "demo"}`;
  }

  function currentActor() {
    if (currentActorKey === ADMIN_ACTOR_KEY) return { id: null, name: "Beheerder" };
    const player = playerById(currentActorKey);
    return player ? { id: player.id, name: player.name } : null;
  }

  function makeLog(action, actor, entityType = null, entityId = null, details = {}) {
    return {
      id: uuid(), action, actor_player_id: actor?.id || null, actor_name: actor?.name || "Onbekend",
      entity_type: entityType, entity_id: entityId, details, created_at: new Date().toISOString()
    };
  }

  class DemoBackend {
    constructor() { this.key = "big2-demo-state-v1"; }
    async bootstrap() {
      const stored = localStorage.getItem(this.key);
      if (stored) {
        const migrated = normalizeState(JSON.parse(stored));
        this.save(migrated);
        return migrated;
      }
      const initial = normalizeState({
        group: { name: "Big Two Vakantiestand – demo", slug: "demo" },
        players: [],
        games: [], logs: []
      });
      this.save(initial);
      return initial;
    }
    save(next) { localStorage.setItem(this.key, JSON.stringify(normalizeState(next))); }
    addLog(current, action, actor, entityType, entityId, details) {
      current.logs.unshift(makeLog(action, actor, entityType, entityId, details));
      current.logs = current.logs.slice(0, 500);
    }
    async logAccess(actor) {
      const current = await this.bootstrap();
      this.addLog(current, "site_access", actor, "site", null, {});
      this.save(current); return current;
    }
    async addGame(payload, actor) {
      const current = await this.bootstrap();
      const game = { id: uuid(), played_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: null, ...payload };
      current.games.unshift(game);
      this.addLog(current, "game_added", actor, "game", game.id, { game });
      this.save(current); return current;
    }
    async updateGame(id, payload, adminPin, actor) {
      const current = await this.bootstrap();
      const game = current.games.find((item) => item.id === id);
      if (!game) throw new Error("Potje niet gevonden.");
      const before = typeof structuredClone === "function" ? structuredClone(game) : JSON.parse(JSON.stringify(game));
      Object.assign(game, payload, { updated_at: new Date().toISOString() });
      this.addLog(current, "game_updated", actor, "game", id, { before, after: game });
      this.save(current); return current;
    }
    async addPlayers(names, adminPin, actor) {
      const current = await this.bootstrap();
      const normalized = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
      const existing = new Set(current.players.map((p) => p.name.toLowerCase()));
      if (normalized.some((name) => existing.has(name.toLowerCase()))) throw new Error("Minstens één speler bestaat al.");
      for (const name of normalized) {
        const player = { id: uuid(), name, active: true };
        current.players.push(player);
        this.addLog(current, "player_added", actor, "player", player.id, { name });
      }
      this.save(current); return current;
    }
    async setPlayerActive(id, active, adminPin, actor) {
      const current = await this.bootstrap();
      const player = current.players.find((p) => p.id === id);
      if (!player) throw new Error("Speler niet gevonden.");
      const previousActive = player.active;
      player.active = active;
      this.addLog(current, "player_status_changed", actor, "player", id, { name: player.name, previous_active: previousActive, active });
      this.save(current); return current;
    }
    async deleteGame(id, adminPin, actor) {
      const current = await this.bootstrap();
      const game = current.games.find((item) => item.id === id);
      if (!game) throw new Error("Potje niet gevonden.");
      current.games = current.games.filter((item) => item.id !== id);
      this.addLog(current, "game_deleted", actor, "game", id, { game });
      this.save(current); return current;
    }
  }

  class SupabaseBackend {
    constructor() {
      if (!window.supabase) throw new Error("Supabase-bibliotheek kon niet worden geladen.");
      this.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
    async rpc(functionName, params) {
      const { data, error } = await this.client.rpc(functionName, params);
      if (error) throw new Error(error.message || "Databasefout");
      return normalizeState(data);
    }
    bootstrap() { return this.rpc("big2_bootstrap", { p_slug: config.groupSlug }); }
    logAccess(actor) {
      return this.rpc("big2_log_access", {
        p_slug: config.groupSlug, p_actor_id: actor?.id || null, p_actor_name: actor?.name || "Onbekend"
      });
    }
    addGame(payload, actor) {
      return this.rpc("big2_add_game", {
        p_slug: config.groupSlug, p_actor_id: actor?.id || null, p_actor_name: actor?.name || "Onbekend",
        p_entered_by: payload.entered_by, p_winner: payload.winner, p_entries: payload.entries, p_note: payload.note || null
      });
    }
    updateGame(id, payload, adminPin, actor) {
      return this.rpc("big2_admin_update_game", {
        p_slug: config.groupSlug, p_admin_pin: adminPin, p_actor_id: actor?.id || null, p_actor_name: actor?.name || "Onbekend",
        p_game_id: id, p_winner: payload.winner, p_entries: payload.entries, p_note: payload.note || null
      });
    }
    addPlayers(names, adminPin, actor) {
      return this.rpc("big2_admin_add_players", {
        p_slug: config.groupSlug, p_admin_pin: adminPin, p_actor_id: actor?.id || null,
        p_actor_name: actor?.name || "Onbekend", p_names: names
      });
    }
    setPlayerActive(id, active, adminPin, actor) {
      return this.rpc("big2_admin_set_player_active", {
        p_slug: config.groupSlug, p_admin_pin: adminPin, p_actor_id: actor?.id || null, p_actor_name: actor?.name || "Onbekend",
        p_player_id: id, p_active: active
      });
    }
    deleteGame(id, adminPin, actor) {
      return this.rpc("big2_admin_delete_game", {
        p_slug: config.groupSlug, p_admin_pin: adminPin, p_actor_id: actor?.id || null, p_actor_name: actor?.name || "Onbekend", p_game_id: id
      });
    }
  }

  function showToast(message, isError = false) {
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 3200);
  }

  function showValidation(message, target = elements.gameValidation) {
    target.textContent = message;
    target.hidden = !message;
  }

  function setupMode() {
    if (config.demoMode) {
      backend = new DemoBackend();
      elements.modeBanner.hidden = false;
      elements.modeBanner.textContent = "Demomodus: gegevens en logboek staan alleen op dit apparaat. Koppel Supabase voor één gedeelde stand.";
    } else {
      const invalid = !config.supabaseUrl || config.supabaseUrl.includes("JOUW-") || !config.supabasePublishableKey || config.supabasePublishableKey.includes("JOUW-");
      if (invalid) throw new Error("Vul eerst config.js in of zet demoMode op true.");
      backend = new SupabaseBackend();
    }
  }

  function populateIdentitySelect() {
    const activePlayers = state.players.filter((player) => player.active);
    elements.identitySelect.innerHTML = [
      '<option value="">Kies je naam</option>',
      ...activePlayers.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`),
      `<option value="${ADMIN_ACTOR_KEY}">Beheerder (alleen beheer)</option>`
    ].join("");
    if (activePlayers.some((player) => player.id === currentActorKey) || currentActorKey === ADMIN_ACTOR_KEY) {
      elements.identitySelect.value = currentActorKey;
    }
  }

  async function requestIdentity(force = false) {
    const stored = localStorage.getItem(actorStorageKey()) || "";
    if (!force && !currentActorKey) currentActorKey = stored;
    const validPlayer = state.players.some((player) => player.id === currentActorKey && player.active);
    if (!force && (validPlayer || currentActorKey === ADMIN_ACTOR_KEY)) return currentActor();

    populateIdentitySelect();
    if (!elements.identityDialog.open) elements.identityDialog.showModal();
    return new Promise((resolve) => {
      elements.identityForm.onsubmit = (event) => {
        event.preventDefault();
        const value = elements.identitySelect.value;
        if (!value) return;
        currentActorKey = value;
        localStorage.setItem(actorStorageKey(), currentActorKey);
        elements.identityDialog.close();
        updateCurrentUserButton();
        resolve(currentActor());
      };
    });
  }

  function updateCurrentUserButton() {
    const actor = currentActor();
    elements.currentUserButton.textContent = actor ? `👤 ${actor.name}` : "👤 Kies gebruiker";
  }

  async function logAccessOnce(actor, force = false) {
    const sessionKey = `big2-access-logged:${state.group?.slug || config.groupSlug || "demo"}:${currentActorKey}`;
    if (!force && sessionStorage.getItem(sessionKey)) return;
    state = await backend.logAccess(actor);
    sessionStorage.setItem(sessionKey, "1");
  }

  async function ensureLoaded() {
    try {
      state = normalizeState(await backend.bootstrap());
      const actor = await requestIdentity(false);
      await logAccessOnce(actor, false);
      renderAll();
    } catch (error) {
      showToast(error.message, true);
      throw error;
    }
  }

  function getStats() {
    const stats = new Map(state.players.map((player) => [player.id, {
      id: player.id, name: player.name, active: player.active, games: 0, wins: 0, penalties: 0
    }]));
    for (const game of state.games) {
      for (const entry of game.entries || []) {
        const row = stats.get(entry.player_id);
        if (!row) continue;
        row.games += 1;
        row.penalties += Number(entry.penalty ?? scorePenalty(Number(entry.cards)));
        if (entry.player_id === game.winner) row.wins += 1;
      }
    }
    return [...stats.values()].map((row) => ({
      ...row,
      qualified: row.games >= QUALIFYING_GAMES,
      gamesNeeded: Math.max(0, QUALIFYING_GAMES - row.games),
      winRate: row.games ? row.wins / row.games : 0,
      averagePenalty: row.games ? row.penalties / row.games : 0
    })).sort((a, b) => {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      if (a.qualified) {
        return a.averagePenalty - b.averagePenalty || b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name, "nl");
      }
      return b.games - a.games || a.averagePenalty - b.averagePenalty || b.wins - a.wins || a.name.localeCompare(b.name, "nl");
    });
  }

  function renderDashboard() {
    const stats = getStats();
    const qualified = stats.filter((row) => row.qualified);
    elements.totalGames.textContent = state.games.length;
    elements.totalPlayers.textContent = state.players.filter((p) => p.active).length;
    const leader = qualified[0];
    elements.leaderName.textContent = leader?.name || "–";
    elements.leaderDetail.textContent = leader
      ? `${leader.averagePenalty.toFixed(1)} gem. straf · ${leader.games} potjes`
      : `Nog niemand heeft ${QUALIFYING_GAMES} potjes gespeeld`;

    let officialPosition = 0;
    elements.rankingBody.innerHTML = stats.map((row) => {
      let position = "–";
      if (row.qualified) {
        officialPosition += 1;
        position = ["🥇", "🥈", "🥉"][officialPosition - 1] || String(officialPosition);
      }
      const qualificationTag = row.qualified ? "" : `<span class="qualification-tag">nog ${row.gamesNeeded} potje${row.gamesNeeded === 1 ? "" : "s"}</span>`;
      const inactiveTag = row.active ? "" : '<span class="inactive-tag">inactief</span>';
      return `<tr class="${row.qualified ? "qualified-row" : "unqualified-row"}">
        <td class="position-medal">${position}</td>
        <td><span class="player-name">${escapeHtml(row.name)}</span>${qualificationTag}${inactiveTag}</td>
        <td><strong>${row.games ? row.averagePenalty.toFixed(1) : "–"}</strong></td>
        <td>${row.games}</td><td>${row.wins}</td><td>${(row.winRate * 100).toFixed(0)}%</td><td>${row.penalties}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="7" class="empty-state">Voeg eerst spelers toe.</td></tr>';

    renderGameList(elements.recentGames, state.games.slice(0, 5), false);
  }

  function gameCard(game, allowActions) {
    const winner = playerName(game.winner);
    const entries = [...(game.entries || [])].sort((a, b) => (a.player_id === game.winner ? -1 : b.player_id === game.winner ? 1 : a.cards - b.cards));
    const pills = entries.map((entry) => {
      const isWinner = entry.player_id === game.winner;
      return `<span class="score-pill ${isWinner ? "winner" : ""}">${escapeHtml(playerName(entry.player_id))}: ${entry.cards} kaart${entry.cards === 1 ? "" : "en"}${isWinner ? " · winnaar" : ` · ${entry.penalty ?? scorePenalty(entry.cards)} straf`}</span>`;
    }).join("");
    const edited = game.updated_at ? ` · aangepast ${formatDate(game.updated_at)}` : "";
    return `<article class="game-card">
      <div class="game-card-head"><div><h3>🏆 ${escapeHtml(winner)}</h3><span class="game-meta">${formatDate(game.played_at || game.created_at)} · ingevoerd door ${escapeHtml(playerName(game.entered_by))}${edited}</span></div>
      ${allowActions ? `<div class="game-actions"><button class="edit-game" type="button" data-edit-game="${game.id}">Aanpassen</button><button class="delete-game" type="button" data-delete-game="${game.id}">Verwijderen</button></div>` : ""}</div>
      <div class="game-scores">${pills}</div>${game.note ? `<p class="game-note">${escapeHtml(game.note)}</p>` : ""}
    </article>`;
  }

  function renderGameList(container, games, allowActions) {
    container.classList.toggle("empty-state", games.length === 0);
    container.innerHTML = games.length ? games.map((game) => gameCard(game, allowActions)).join("") : "Nog geen potjes ingevoerd.";
  }

  function renderEntry() {
    const activePlayers = state.players.filter((player) => player.active);
    selectedPlayers = new Set([...selectedPlayers].filter((id) => activePlayers.some((p) => p.id === id)));
    elements.participantChips.innerHTML = activePlayers.map((player) => `<label class="player-chip">
      <input type="checkbox" value="${player.id}" ${selectedPlayers.has(player.id) ? "checked" : ""}>
      <span>${escapeHtml(player.name)}</span></label>`).join("") || '<p class="empty-state">Voeg bij Beheer eerst spelers toe.</p>';
    updateEntryControls();
  }

  function updateEntryControls() {
    const players = [...selectedPlayers].map(playerById).filter(Boolean);
    const previousWinner = elements.winnerSelect.value;
    const previousEnteredBy = elements.enteredBySelect.value;
    const options = players.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    elements.winnerSelect.innerHTML = `<option value="">Kies winnaar</option>${options}`;
    elements.enteredBySelect.innerHTML = `<option value="">Kies invoerder</option>${options}`;
    elements.winnerSelect.disabled = players.length < 2;
    elements.enteredBySelect.disabled = players.length < 2;
    if (selectedPlayers.has(previousWinner)) elements.winnerSelect.value = previousWinner;
    if (selectedPlayers.has(previousEnteredBy)) elements.enteredBySelect.value = previousEnteredBy;
    else if (selectedPlayers.has(currentActorKey)) elements.enteredBySelect.value = currentActorKey;
    elements.cardsFieldset.disabled = !elements.winnerSelect.value;
    renderCardsInputs();
  }

  function renderCardsInputs() {
    const winnerId = elements.winnerSelect.value;
    const existing = new Map($$("[data-card-player]").map((input) => [input.dataset.cardPlayer, input.value]));
    const players = [...selectedPlayers].map(playerById).filter(Boolean);
    const maxCards = maxCardsForPlayerCount(players.length);
    elements.cardsFieldset.disabled = !winnerId;
    elements.cardsInputs.innerHTML = !winnerId ? '<p class="empty-state">Kies eerst de winnaar.</p>' : players.map((player) => {
      const winner = player.id === winnerId;
      const value = winner ? 0 : (existing.get(player.id) || "");
      return `<div class="score-row ${winner ? "winner-row" : ""}">
        <span class="score-name">${escapeHtml(player.name)}</span>
        <input data-card-player="${player.id}" type="number" inputmode="numeric" min="${winner ? 0 : 1}" max="${maxCards}" value="${value}" ${winner ? "readonly" : "required"} aria-label="Kaarten over voor ${escapeHtml(player.name)}">
        <span class="penalty-preview" data-penalty-player="${player.id}">${winner ? "0 strafpunten" : value ? `${scorePenalty(Number(value))} strafpunten` : "– strafpunten"}</span>
      </div>`;
    }).join("");
  }

  function renderAdmin() {
    elements.adminPlayerList.innerHTML = state.players.map((player) => `<div class="admin-row ${player.active ? "" : "inactive"}">
      <span>${escapeHtml(player.name)}</span>
      <button class="status-button" type="button" data-player-active="${player.id}" data-next-active="${!player.active}">${player.active ? "Deactiveren" : "Activeren"}</button>
    </div>`).join("") || '<p class="empty-state">Nog geen spelers.</p>';
  }

  function describeLog(log) {
    const details = log.details || {};
    const game = details.game || details.after || {};
    switch (log.action) {
      case "site_access": return "Website geopend";
      case "game_added": return `Potje toegevoegd${game.winner ? ` · winnaar ${playerName(game.winner)}` : ""}`;
      case "game_updated": return `Potje aangepast${game.winner ? ` · winnaar ${playerName(game.winner)}` : ""}`;
      case "game_deleted": return `Potje verwijderd${game.winner ? ` · winnaar ${playerName(game.winner)}` : ""}`;
      case "player_added": return `Speler toegevoegd · ${details.name || "onbekend"}`;
      case "player_status_changed": return `${details.active ? "Speler geactiveerd" : "Speler gedeactiveerd"} · ${details.name || "onbekend"}`;
      default: return log.action || "Onbekende actie";
    }
  }

  function renderLogbook() {
    elements.logbookList.classList.toggle("empty-state", state.logs.length === 0);
    elements.logbookList.innerHTML = state.logs.length ? state.logs.map((log) => `<article class="log-card">
      <div class="log-icon">${log.action === "site_access" ? "👁" : log.action === "game_deleted" ? "🗑" : log.action === "game_updated" ? "✎" : "•"}</div>
      <div><h3>${escapeHtml(describeLog(log))}</h3><p><strong>${escapeHtml(log.actor_name || "Onbekend")}</strong> · ${formatLogDate(log.created_at)}</p></div>
    </article>`).join("") : "Nog geen logboekregels.";
  }

  function renderAll() {
    elements.groupTitle.textContent = state.group?.name || "Big Two Vakantiestand";
    updateCurrentUserButton();
    renderDashboard(); renderEntry(); renderGameList(elements.historyGames, state.games, true); renderLogbook(); renderAdmin();
  }

  async function requireActor() {
    return currentActor() || await requestIdentity(false);
  }

  async function askAdminPin() {
    if (config.demoMode) return "demo";
    const value = window.prompt("Vul de beheerderscode in:");
    if (!value) throw new Error("Beheerderscode ontbreekt.");
    return value.trim();
  }

  async function confirmAction(title, text) {
    elements.confirmTitle.textContent = title; elements.confirmText.textContent = text;
    elements.confirmDialog.showModal();
    const result = await new Promise((resolve) => {
      elements.confirmDialog.addEventListener("close", () => resolve(elements.confirmDialog.returnValue), { once: true });
    });
    return result === "confirm";
  }

  function validateEntries(playerIds, winner, inputSelector) {
    const ids = [...playerIds];
    const maxCards = maxCardsForPlayerCount(ids.length);
    const entries = [];
    for (const playerId of ids) {
      const input = $(inputSelector(playerId));
      const cards = Number(input?.value);
      if (!Number.isInteger(cards) || cards < (playerId === winner ? 0 : 1) || cards > maxCards) {
        throw new Error(`Vul voor ${playerName(playerId)} een geldig aantal kaarten in van ${playerId === winner ? 0 : 1} t/m ${maxCards}.`);
      }
      entries.push({ player_id: playerId, cards, penalty: scorePenalty(cards) });
    }
    return entries;
  }

  async function handleGameSubmit(event) {
    event.preventDefault(); showValidation("");
    const winner = elements.winnerSelect.value;
    const enteredBy = elements.enteredBySelect.value;
    if (selectedPlayers.size < 2) return showValidation("Selecteer minimaal twee spelers.");
    if (!winner || !enteredBy) return showValidation("Kies de winnaar en de invoerder.");
    let entries;
    try { entries = validateEntries(selectedPlayers, winner, (id) => `[data-card-player="${id}"]`); }
    catch (error) { return showValidation(error.message); }
    try {
      const submit = elements.gameForm.querySelector("button[type=submit]"); submit.disabled = true;
      state = await backend.addGame({ entered_by: enteredBy, winner, entries, note: elements.gameNote.value.trim() }, await requireActor());
      selectedPlayers.clear(); elements.gameForm.reset(); renderAll(); switchView("dashboard");
      showToast("Potje opgeslagen.");
    } catch (error) { showToast(error.message, true); }
    finally { elements.gameForm.querySelector("button[type=submit]").disabled = false; }
  }

  async function handleAddPlayer(event) {
    event.preventDefault();
    const names = [...new Set(elements.newPlayerNames.value
      .split(/[\n,;]+/)
      .map((name) => name.trim())
      .filter(Boolean))];
    if (!names.length || names.some((name) => name.length < 2 || name.length > 40)) {
      return showToast("Voer geldige namen in, één per regel.", true);
    }
    try {
      state = await backend.addPlayers(names, await askAdminPin(), await requireActor());
      elements.newPlayerNames.value = ""; renderAll();
      showToast(`${names.length} ${names.length === 1 ? "speler is" : "spelers zijn"} toegevoegd.`);
    } catch (error) { showToast(error.message, true); }
  }

  async function handleAdminClick(event) {
    const button = event.target.closest("[data-player-active]"); if (!button) return;
    const id = button.dataset.playerActive; const active = button.dataset.nextActive === "true";
    try {
      state = await backend.setPlayerActive(id, active, await askAdminPin(), await requireActor());
      renderAll(); showToast("Speler bijgewerkt.");
    } catch (error) { showToast(error.message, true); }
  }

  function renderEditInputs() {
    const game = state.games.find((item) => item.id === editingGameId);
    if (!game) return;
    const winner = elements.editWinnerSelect.value;
    const existing = new Map($$("[data-edit-card-player]").map((input) => [input.dataset.editCardPlayer, input.value]));
    const maxCards = maxCardsForPlayerCount((game.entries || []).length);
    elements.editCardsInputs.innerHTML = (game.entries || []).map((entry) => {
      const isWinner = entry.player_id === winner;
      let value = isWinner ? 0 : (existing.get(entry.player_id) ?? entry.cards);
      if (!isWinner && Number(value) === 0) value = 1;
      return `<div class="score-row ${isWinner ? "winner-row" : ""}">
        <span class="score-name">${escapeHtml(playerName(entry.player_id))}</span>
        <input data-edit-card-player="${entry.player_id}" type="number" inputmode="numeric" min="${isWinner ? 0 : 1}" max="${maxCards}" value="${value}" ${isWinner ? "readonly" : "required"}>
        <span class="penalty-preview">${scorePenalty(Number(value))} strafpunten</span>
      </div>`;
    }).join("");
  }

  function openEditGame(id) {
    const game = state.games.find((item) => item.id === id);
    if (!game) return showToast("Potje niet gevonden.", true);
    editingGameId = id;
    showValidation("", elements.editGameValidation);
    elements.editWinnerSelect.innerHTML = (game.entries || []).map((entry) => `<option value="${entry.player_id}">${escapeHtml(playerName(entry.player_id))}</option>`).join("");
    elements.editWinnerSelect.value = game.winner;
    elements.editGameNote.value = game.note || "";
    renderEditInputs();
    elements.editGameDialog.showModal();
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    showValidation("", elements.editGameValidation);
    const game = state.games.find((item) => item.id === editingGameId);
    if (!game) return showValidation("Potje niet gevonden.", elements.editGameValidation);
    const winner = elements.editWinnerSelect.value;
    const ids = (game.entries || []).map((entry) => entry.player_id);
    let entries;
    try { entries = validateEntries(ids, winner, (id) => `[data-edit-card-player="${id}"]`); }
    catch (error) { return showValidation(error.message, elements.editGameValidation); }
    try {
      const submit = elements.editGameForm.querySelector("button[type=submit]"); submit.disabled = true;
      state = await backend.updateGame(editingGameId, { winner, entries, note: elements.editGameNote.value.trim() }, await askAdminPin(), await requireActor());
      elements.editGameDialog.close(); editingGameId = ""; renderAll(); showToast("Potje aangepast.");
    } catch (error) { showValidation(error.message, elements.editGameValidation); }
    finally { elements.editGameForm.querySelector("button[type=submit]").disabled = false; }
  }

  async function handleHistoryClick(event) {
    const editButton = event.target.closest("[data-edit-game]");
    if (editButton) return openEditGame(editButton.dataset.editGame);
    const deleteButton = event.target.closest("[data-delete-game]"); if (!deleteButton) return;
    if (!await confirmAction("Potje verwijderen?", "De stand wordt direct opnieuw berekend. De verwijdering blijft zichtbaar in het logboek.")) return;
    try {
      state = await backend.deleteGame(deleteButton.dataset.deleteGame, await askAdminPin(), await requireActor());
      renderAll(); showToast("Potje verwijderd.");
    } catch (error) { showToast(error.message, true); }
  }

  function exportCsv() {
    const header = ["datum", "winnaar", "ingevoerd_door", "speler", "kaarten_over", "strafpunten", "opmerking"];
    const rows = state.games.flatMap((game) => (game.entries || []).map((entry) => [
      game.played_at || game.created_at, playerName(game.winner), playerName(game.entered_by), playerName(entry.player_id), entry.cards,
      entry.penalty ?? scorePenalty(entry.cards), game.note || ""
    ]));
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `big2-uitslagen-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function switchView(name) {
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
    $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindEvents() {
    $$(".nav-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    elements.participantChips.addEventListener("change", (event) => {
      const checkbox = event.target.closest('input[type="checkbox"]'); if (!checkbox) return;
      checkbox.checked ? selectedPlayers.add(checkbox.value) : selectedPlayers.delete(checkbox.value); updateEntryControls();
    });
    elements.winnerSelect.addEventListener("change", renderCardsInputs);
    elements.cardsInputs.addEventListener("input", (event) => {
      const input = event.target.closest("[data-card-player]"); if (!input) return;
      const preview = $(`[data-penalty-player="${input.dataset.cardPlayer}"]`);
      preview.textContent = input.value === "" ? "– strafpunten" : `${scorePenalty(Number(input.value))} strafpunten`;
    });
    elements.gameForm.addEventListener("submit", handleGameSubmit);
    elements.addPlayerForm.addEventListener("submit", handleAddPlayer);
    elements.adminPlayerList.addEventListener("click", handleAdminClick);
    elements.historyGames.addEventListener("click", handleHistoryClick);
    elements.editWinnerSelect.addEventListener("change", renderEditInputs);
    elements.editGameForm.addEventListener("submit", handleEditSubmit);
    elements.exportButton.addEventListener("click", exportCsv);
    elements.refreshButton.addEventListener("click", () => ensureLoaded());
    elements.currentUserButton.addEventListener("click", async () => {
      try {
        const actor = await requestIdentity(true);
        await logAccessOnce(actor, true);
        renderAll(); showToast(`Actief als ${actor.name}.`);
      } catch (error) { showToast(error.message, true); }
    });
  }

  async function init() {
    try { setupMode(); bindEvents(); await ensureLoaded(); }
    catch (error) { elements.modeBanner.hidden = false; elements.modeBanner.textContent = error.message; showToast(error.message, true); }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  init();
})();

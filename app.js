(() => {
  "use strict";

  const config = window.BIG2_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    groupTitle: $("#group-title"), modeBanner: $("#mode-banner"), toast: $("#toast"),
    totalGames: $("#total-games"), totalPlayers: $("#total-players"), leaderName: $("#leader-name"), leaderDetail: $("#leader-detail"),
    rankingBody: $("#ranking-body"), recentGames: $("#recent-games"), historyGames: $("#history-games"),
    participantChips: $("#participant-chips"), winnerSelect: $("#winner-select"), enteredBySelect: $("#entered-by-select"),
    cardsFieldset: $("#cards-fieldset"), cardsInputs: $("#cards-inputs"), gameForm: $("#game-form"), gameNote: $("#game-note"),
    gameValidation: $("#game-validation"), refreshButton: $("#refresh-button"), exportButton: $("#export-button"),
    addPlayerForm: $("#add-player-form"), newPlayerName: $("#new-player-name"), adminPlayerList: $("#admin-player-list"),
    pinDialog: $("#pin-dialog"), pinForm: $("#pin-form"), pinInput: $("#pin-input"), pinError: $("#pin-error"),
    confirmDialog: $("#confirm-dialog"), confirmTitle: $("#confirm-title"), confirmText: $("#confirm-text")
  };

  let state = { group: { name: "Big Two Vakantiestand" }, players: [], games: [] };
  let selectedPlayers = new Set();
  let groupPin = sessionStorage.getItem("big2-group-pin") || "";
  let backend;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const scorePenalty = (cards) => cards === 13 ? 39 : cards >= 10 ? cards * 2 : cards;
  const playerById = (id) => state.players.find((player) => player.id === id);
  const playerName = (id) => playerById(id)?.name || "Onbekend";
  const formatDate = (iso) => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  class DemoBackend {
    constructor() { this.key = "big2-demo-state-v1"; }
    async bootstrap() {
      const stored = localStorage.getItem(this.key);
      if (stored) return JSON.parse(stored);
      const initial = {
        group: { name: "Big Two Vakantiestand – demo", slug: "demo" },
        players: ["Corne", "Speler 2", "Speler 3", "Speler 4"].map((name) => ({ id: uuid(), name, active: true })),
        games: []
      };
      this.save(initial); return initial;
    }
    save(next) { localStorage.setItem(this.key, JSON.stringify(next)); }
    async addGame(payload) {
      const current = await this.bootstrap();
      current.games.unshift({ id: uuid(), played_at: new Date().toISOString(), created_at: new Date().toISOString(), ...payload });
      this.save(current); return current;
    }
    async addPlayer(name) {
      const current = await this.bootstrap();
      if (current.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error("Deze speler bestaat al.");
      current.players.push({ id: uuid(), name, active: true }); this.save(current); return current;
    }
    async setPlayerActive(id, active) {
      const current = await this.bootstrap();
      const player = current.players.find((p) => p.id === id); if (player) player.active = active;
      this.save(current); return current;
    }
    async deleteGame(id) {
      const current = await this.bootstrap(); current.games = current.games.filter((g) => g.id !== id);
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
      return data;
    }
    bootstrap(pin) { return this.rpc("big2_bootstrap", { p_slug: config.groupSlug, p_pin: pin }); }
    addGame(payload, pin) {
      return this.rpc("big2_add_game", {
        p_slug: config.groupSlug, p_pin: pin, p_entered_by: payload.entered_by,
        p_winner: payload.winner, p_entries: payload.entries, p_note: payload.note || null
      });
    }
    addPlayer(name, adminPin) { return this.rpc("big2_admin_add_player", { p_slug: config.groupSlug, p_admin_pin: adminPin, p_name: name }); }
    setPlayerActive(id, active, adminPin) { return this.rpc("big2_admin_set_player_active", { p_slug: config.groupSlug, p_admin_pin: adminPin, p_player_id: id, p_active: active }); }
    deleteGame(id, adminPin) { return this.rpc("big2_admin_delete_game", { p_slug: config.groupSlug, p_admin_pin: adminPin, p_game_id: id }); }
  }

  function showToast(message, isError = false) {
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 3200);
  }

  function showValidation(message) {
    elements.gameValidation.textContent = message;
    elements.gameValidation.hidden = !message;
  }

  function setupMode() {
    if (config.demoMode) {
      backend = new DemoBackend();
      elements.modeBanner.hidden = false;
      elements.modeBanner.textContent = "Demomodus: gegevens staan alleen op dit apparaat. Koppel Supabase voor een gedeelde vakantiestand.";
    } else {
      const invalid = !config.supabaseUrl || config.supabaseUrl.includes("JOUW-") || !config.supabasePublishableKey || config.supabasePublishableKey.includes("JOUW-");
      if (invalid) throw new Error("Vul eerst config.js in of zet demoMode op true.");
      backend = new SupabaseBackend();
    }
  }

  async function requestGroupPin() {
    if (config.demoMode) return "demo";
    elements.pinInput.value = groupPin;
    elements.pinError.hidden = true;
    if (!elements.pinDialog.open) elements.pinDialog.showModal();
    return new Promise((resolve) => {
      elements.pinForm.onsubmit = (event) => {
        event.preventDefault();
        const value = elements.pinInput.value.trim();
        if (!value) return;
        elements.pinDialog.close();
        resolve(value);
      };
    });
  }

  async function ensureLoaded(forcePrompt = false) {
    try {
      if (!config.demoMode && (!groupPin || forcePrompt)) groupPin = await requestGroupPin();
      state = await backend.bootstrap(groupPin);
      if (!config.demoMode) sessionStorage.setItem("big2-group-pin", groupPin);
      renderAll();
    } catch (error) {
      if (!config.demoMode) {
        sessionStorage.removeItem("big2-group-pin"); groupPin = "";
        elements.pinError.textContent = "Code onjuist of database niet bereikbaar.";
        elements.pinError.hidden = false;
        if (elements.pinDialog.open) elements.pinDialog.close();
        window.setTimeout(() => ensureLoaded(true), 0);
      }
      showToast(error.message, true);
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
      winRate: row.games ? row.wins / row.games : 0,
      averagePenalty: row.games ? row.penalties / row.games : 0
    })).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.averagePenalty - b.averagePenalty || a.name.localeCompare(b.name, "nl"));
  }

  function renderDashboard() {
    const stats = getStats();
    elements.totalGames.textContent = state.games.length;
    elements.totalPlayers.textContent = state.players.filter((p) => p.active).length;
    const leader = stats.find((row) => row.games > 0);
    elements.leaderName.textContent = leader?.name || "–";
    elements.leaderDetail.textContent = leader ? `${leader.wins} punt${leader.wins === 1 ? "" : "en"} uit ${leader.games} potjes` : "Nog geen uitslagen";

    elements.rankingBody.innerHTML = stats.map((row, index) => {
      const medal = ["🥇", "🥈", "🥉"][index] || String(index + 1);
      return `<tr>
        <td class="position-medal">${medal}</td>
        <td><span class="player-name">${escapeHtml(row.name)}</span>${row.active ? "" : '<span class="inactive-tag">inactief</span>'}</td>
        <td><strong>${row.wins}</strong></td><td>${row.games}</td><td>${(row.winRate * 100).toFixed(0)}%</td>
        <td>${row.penalties}</td><td>${row.averagePenalty.toFixed(1)}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="7" class="empty-state">Voeg eerst spelers toe.</td></tr>';

    renderGameList(elements.recentGames, state.games.slice(0, 5), false);
  }

  function gameCard(game, allowDelete) {
    const winner = playerName(game.winner);
    const entries = [...(game.entries || [])].sort((a, b) => (a.player_id === game.winner ? -1 : b.player_id === game.winner ? 1 : a.cards - b.cards));
    const pills = entries.map((entry) => {
      const isWinner = entry.player_id === game.winner;
      return `<span class="score-pill ${isWinner ? "winner" : ""}">${escapeHtml(playerName(entry.player_id))}: ${entry.cards} kaart${entry.cards === 1 ? "" : "en"}${isWinner ? " · winnaar" : ` · ${entry.penalty ?? scorePenalty(entry.cards)} straf`}</span>`;
    }).join("");
    return `<article class="game-card">
      <div class="game-card-head"><div><h3>🏆 ${escapeHtml(winner)}</h3><span class="game-meta">${formatDate(game.played_at || game.created_at)} · ingevoerd door ${escapeHtml(playerName(game.entered_by))}</span></div>
      ${allowDelete ? `<button class="delete-game" type="button" data-delete-game="${game.id}">Verwijderen</button>` : ""}</div>
      <div class="game-scores">${pills}</div>${game.note ? `<p class="game-note">${escapeHtml(game.note)}</p>` : ""}
    </article>`;
  }

  function renderGameList(container, games, allowDelete) {
    container.classList.toggle("empty-state", games.length === 0);
    container.innerHTML = games.length ? games.map((game) => gameCard(game, allowDelete)).join("") : "Nog geen potjes ingevoerd.";
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
    elements.cardsFieldset.disabled = !elements.winnerSelect.value;
    renderCardsInputs();
  }

  function renderCardsInputs() {
    const winnerId = elements.winnerSelect.value;
    const existing = new Map($$("[data-card-player]").map((input) => [input.dataset.cardPlayer, input.value]));
    const players = [...selectedPlayers].map(playerById).filter(Boolean);
    elements.cardsFieldset.disabled = !winnerId;
    elements.cardsInputs.innerHTML = !winnerId ? '<p class="empty-state">Kies eerst de winnaar.</p>' : players.map((player) => {
      const winner = player.id === winnerId;
      const value = winner ? 0 : (existing.get(player.id) || "");
      return `<div class="score-row ${winner ? "winner-row" : ""}">
        <span class="score-name">${escapeHtml(player.name)}</span>
        <input data-card-player="${player.id}" type="number" inputmode="numeric" min="${winner ? 0 : 1}" max="13" value="${value}" ${winner ? "readonly" : "required"} aria-label="Kaarten over voor ${escapeHtml(player.name)}">
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

  function renderAll() {
    elements.groupTitle.textContent = state.group?.name || "Big Two Vakantiestand";
    renderDashboard(); renderEntry(); renderGameList(elements.historyGames, state.games, true); renderAdmin();
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
    const result = await new Promise((resolve) => { elements.confirmDialog.addEventListener("close", () => resolve(elements.confirmDialog.returnValue), { once: true }); });
    return result === "confirm";
  }

  async function handleGameSubmit(event) {
    event.preventDefault(); showValidation("");
    const winner = elements.winnerSelect.value;
    const enteredBy = elements.enteredBySelect.value;
    if (selectedPlayers.size < 2) return showValidation("Selecteer minimaal twee spelers.");
    if (!winner || !enteredBy) return showValidation("Kies de winnaar en de invoerder.");
    const entries = [];
    for (const playerId of selectedPlayers) {
      const input = $(`[data-card-player="${playerId}"]`);
      const cards = Number(input?.value);
      if (!Number.isInteger(cards) || cards < (playerId === winner ? 0 : 1) || cards > 13) {
        return showValidation(`Vul voor ${playerName(playerId)} een geldig aantal kaarten in.`);
      }
      entries.push({ player_id: playerId, cards, penalty: scorePenalty(cards) });
    }
    try {
      const submit = elements.gameForm.querySelector("button[type=submit]"); submit.disabled = true;
      state = await backend.addGame({ entered_by: enteredBy, winner, entries, note: elements.gameNote.value.trim() }, groupPin);
      selectedPlayers.clear(); elements.gameForm.reset(); renderAll(); switchView("dashboard");
      showToast("Potje opgeslagen.");
    } catch (error) { showToast(error.message, true); }
    finally { elements.gameForm.querySelector("button[type=submit]").disabled = false; }
  }

  async function handleAddPlayer(event) {
    event.preventDefault();
    const name = elements.newPlayerName.value.trim();
    if (name.length < 2) return showToast("Vul een geldige naam in.", true);
    try {
      state = await backend.addPlayer(name, await askAdminPin());
      elements.newPlayerName.value = ""; renderAll(); showToast(`${name} is toegevoegd.`);
    } catch (error) { showToast(error.message, true); }
  }

  async function handleAdminClick(event) {
    const button = event.target.closest("[data-player-active]"); if (!button) return;
    const id = button.dataset.playerActive; const active = button.dataset.nextActive === "true";
    try { state = await backend.setPlayerActive(id, active, await askAdminPin()); renderAll(); showToast("Speler bijgewerkt."); }
    catch (error) { showToast(error.message, true); }
  }

  async function handleHistoryClick(event) {
    const button = event.target.closest("[data-delete-game]"); if (!button) return;
    if (!await confirmAction("Potje verwijderen?", "De stand wordt direct opnieuw berekend.")) return;
    try { state = await backend.deleteGame(button.dataset.deleteGame, await askAdminPin()); renderAll(); showToast("Potje verwijderd."); }
    catch (error) { showToast(error.message, true); }
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
    elements.exportButton.addEventListener("click", exportCsv);
    elements.refreshButton.addEventListener("click", () => ensureLoaded(false));
  }

  async function init() {
    try { setupMode(); bindEvents(); await ensureLoaded(false); }
    catch (error) { elements.modeBanner.hidden = false; elements.modeBanner.textContent = error.message; showToast(error.message, true); }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  init();
})();

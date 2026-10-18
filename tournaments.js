/* Tournament navigation and management, shared by the main app and the isolated guest view. */
(() => {
  "use strict";
  window.Big2Tournaments = function createTournaments(o) {
    const mode = document.body.hasAttribute("data-tournament");
    const token = mode ? location.hash.slice(1) : "";
    if (mode) window.addEventListener("hashchange", () => location.reload());
    const key = `big2-tournaments:${o.config.groupSlug}`;
    const dismissKey = `big2-tournament-dismissed:${o.config.groupSlug}`;
    const mainKey = `big2-main-app:${o.config.groupSlug}`;
    const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const write = (k,v) => { try { localStorage.setItem(k,v); } catch {} };
    const $ = (s) => document.querySelector(s);
    const html = o.escapeHtml;
    let items = [];
    let setupPin = "";
    let rosterSources = [];
    let checking = false;
    const isMaster = () => mode && o.getActor()?.id === o.getState().tournament?.master_player_id;
    const link = (t = { token }) => {
      const url = new URL("tournament.html", location.href);
      url.hash = t.token;
      return url.href;
    };
    function open(t, replace = false) {
      write(mainKey, "1");
      if (!t.is_archived) write(dismissKey, "");
      location[replace ? "replace" : "assign"](link(t));
    }
    async function checkAutoEntry() {
      if (mode || o.config.demoMode || checking) return false;
      checking = true;
      write(mainKey,"1");
      try {
        if (navigator.onLine) {
          const result = await o.rpc("big2_tournament_overview",{ p_slug:o.config.groupSlug });
          items = result.tournaments || [];
          write(key,JSON.stringify(items));
        } else {
          items = JSON.parse(read(key) || "[]");
        }
        const active = items.find(t => !t.is_archived);
        if (active && read(dismissKey) !== active.id) {
          if (navigator.onLine && await o.pendingCount()) await o.beforeAutoEntry?.();
          // The current installed app finds the tournament itself; no shared link is needed.
          location.replace(link(active));
          return true;
        }
      } catch (error) {
        // Older deployments and a failed overview request must not block ordinary scoring.
        console.warn("Toernooien konden niet worden opgehaald.", error.message);
      } finally { checking = false; }
      return false;
    }
    function initialActor(state, current) {
      if (!mode || current || read(`big2-current-actor:${state.group.slug}`)) return current;
      const source = read(`big2-current-actor:${o.config.groupSlug}`);
      if (!source || source === "__admin__") return "";
      return state.players.find(p => p.active && p.source_player_id === source)?.id || "";
    }
    function selectorOptions() {
      if (mode) return "";
      return items.length ? `<optgroup label="Toernooien">${items.map(t => `<option value="tournament:${t.id}">${t.is_archived ? "▣" : "🏆"} ${html(t.name)} · ${t.is_archived ? "archief" : "toernooi"}</option>`).join("")}</optgroup>` : "";
    }
    function select(value) {
      if (!value.startsWith("tournament:")) return false;
      const item = items.find(t => t.id === value.slice(11));
      if (item) open(item);
      return true;
    }
    function sourceChips(players, selected = []) {
      return players.map(p => `<label class="player-chip"><input type="checkbox" value="${p.id}" ${selected.includes(p.id) ? "checked" : ""}><span>${html(p.name)}</span></label>`).join("");
    }
    function names(value) {
      return [...new Set(value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean))];
    }
    function checked(selector) { return [...document.querySelectorAll(`${selector} input:checked`)].map(el => el.value); }
    function setBusy(form, busy) { form.querySelectorAll('button[type="submit"]').forEach(b => { b.disabled = busy; }); }
    function install() {
      document.body.classList.toggle("tournament-mode",mode);
      $("#view-admin").insertAdjacentHTML("afterbegin",`<section id="tournament-admin" class="panel">
        <div class="panel-heading"><div><p class="eyebrow">Toernooi</p><h2 id="tournament-admin-title">Toernooien</h2></div></div>
        <div id="tournament-admin-content"></div></section>`);
      document.body.insertAdjacentHTML("beforeend",`<dialog id="tournament-dialog" class="wide-dialog"><form id="tournament-create-form" class="dialog-card">
        <p class="eyebrow">Nieuw toernooi</p><h2>Toernooi aanmaken</h2>
        <p id="tournament-master-label"></p>
        <label><span>Toernooinaam (maximaal 20 tekens)</span><input id="tournament-name" minlength="2" maxlength="20" required autocomplete="off"></label>
        <fieldset><legend>Bestaande spelers</legend><div id="tournament-source-players" class="player-chips"></div></fieldset>
        <label><span>Nieuwe namen, één per regel</span><textarea id="tournament-new-names" rows="4" maxlength="1500"></textarea></label>
        <p class="field-help">Nieuwe namen en potjes blijven binnen dit toernooi. Iedereen staat vanaf het eerste potje in de ranglijst. Je kunt later meer deelnemers toevoegen.</p>
        <p id="tournament-create-error" class="validation-message" role="alert" hidden></p>
        <div class="dialog-actions"><button type="button" class="secondary-button" data-close-tournament-dialog>Annuleren</button><button type="submit" class="primary-button">Toernooi maken</button></div>
      </form></dialog>
      <dialog id="tournament-add-dialog" class="wide-dialog"><form id="tournament-add-form" class="dialog-card">
        <h2>Deelnemers toevoegen</h2><fieldset><legend>Bestaande spelers</legend><div id="tournament-add-sources" class="player-chips"></div></fieldset>
        <label><span>Nieuwe namen, één per regel</span><textarea id="tournament-add-names" rows="4" maxlength="1500"></textarea></label>
        <p class="field-help">Deze namen worden uitsluitend aan dit toernooi toegevoegd.</p><p id="tournament-add-error" class="validation-message" role="alert" hidden></p>
        <div class="dialog-actions"><button type="button" class="secondary-button" data-close-add-dialog>Annuleren</button><button type="submit" class="primary-button">Toevoegen</button></div>
      </form></dialog>`);
      $("[data-close-tournament-dialog]").onclick=()=>$("#tournament-dialog").close();
      $("[data-close-add-dialog]").onclick=()=>$("#tournament-add-dialog").close();
      $("#tournament-dialog").addEventListener("close",()=>{ setupPin=""; });
      $("#tournament-create-form").addEventListener("submit",create);
      $("#tournament-add-form").addEventListener("submit",add);
      $("#tournament-admin-content").addEventListener("click",onAdminClick);
      $("#tournament-admin-content").addEventListener("submit",rename);
      if (mode) {
        $("#tab-logbook").hidden=true;
        $(".period-picker").hidden=true;
        const rule = [...document.querySelectorAll(".game-rules-panel p")].find(el=>el.textContent.includes("vanaf 10 gespeelde"));
        if (rule) rule.textContent="In dit toernooi telt iedereen vanaf het eerste gespeelde potje mee. Spelers zonder potjes staan onderaan. De toernooistand staat volledig los van de jaarstand.";
        $("#identity-dialog .eyebrow").textContent="Toernooideelnemer";
        $("#identity-dialog p:not(.eyebrow)").textContent="Kies je eigen naam uit de deelnemers die de game master heeft toegevoegd.";
      }
      let hiddenAt=0;
      document.addEventListener("visibilitychange",()=>{
        if (document.hidden) { hiddenAt=Date.now(); return; }
        if (!hiddenAt || Date.now()-hiddenAt<1500 || document.querySelector("dialog[open]")) return;
        // On reopening the installed app, discover a new tournament before showing its normal view.
        o.reload().catch(error=>o.showToast(error.message,true));
      });
      window.addEventListener("pageshow",event=>{ if(event.persisted) o.reload().catch(()=>{}); });
    }
    function render() {
      const state=o.getState(), t=state.tournament;
      const container=$("#tournament-admin-content");
      if (!mode) {
        const active=items.find(t=>!t.is_archived);
        container.innerHTML=o.config.demoMode ? '<p class="field-help">Toernooien zijn beschikbaar in de gekoppelde app.</p>' : active
          ? `<p><strong>${html(active.name)}</strong> is actief.</p><button class="primary-button compact" data-open-tournament="${active.id}" type="button">Toernooi openen</button>`
          : '<p class="field-help">Maak een apart toernooi met bestaande spelers en gasten. Alleen voor het aanmaken is de beheerderscode nodig.</p><button class="primary-button compact" data-create-tournament type="button">Nieuw toernooi</button>';
        return;
      }
      if (!t) { container.textContent="Toernooi laden…"; return; }
      $("#tournament-admin-title").textContent=t.is_archived ? "Toernooiarchief" : "Toernooibeheer";
      const master=isMaster();
      const masterName=state.players.find(p=>p.id===t.master_player_id)?.name || "Onbekend";
      container.innerHTML=`<p class="field-help">Game master: <strong>${html(masterName)}</strong>. Beheer werkt op basis van de gekozen naam en goed vertrouwen.</p>
        <label><span>Deellink voor dit toernooi</span><input id="tournament-share-link" type="url" readonly value="${html(link())}"></label>
        <button class="secondary-button compact" type="button" data-copy-tournament>Link kopiëren</button>
        ${master && !t.is_archived ? `<form id="tournament-rename-form" class="tournament-rename-form"><label class="grow"><span>Toernooinaam</span><input name="name" value="${html(t.name)}" minlength="2" maxlength="20" required></label><button class="secondary-button compact" type="submit">Naam opslaan</button></form>
        <button class="primary-button compact" data-add-tournament-player type="button">Deelnemers toevoegen</button>` : ""}
        <div class="admin-list">${state.players.map(p=>`<div class="admin-row ${p.active ? "" : "inactive"}"><strong>${html(p.name)}${p.id===t.master_player_id ? " · game master" : ""}${p.active ? "" : " · verwijderd"}</strong>
          ${master && !t.is_archived && p.active && p.id!==t.master_player_id ? `<button class="danger-outline-button" type="button" data-remove-tournament-player="${p.id}">Verwijderen</button>` : ""}</div>`).join("")}</div>
        ${master && !t.is_archived ? '<button class="danger-outline-button" type="button" data-close-tournament>Toernooi afsluiten</button>' : ""}
        ${read(mainKey) ? '<div class="tournament-exit"><button class="secondary-button" type="button" data-leave-tournament>Toernooi verlaten</button><p class="field-help">Alleen deze telefoon keert terug naar de gewone app. Je blijft deelnemer.</p></div>' : '<p class="field-help">Deze link toont uitsluitend dit toernooi.</p>'}`;
      document.title=`${t.name} · Big Two`;
      $("#header-context-label").textContent=t.is_archived ? "Toernooi · archief" : "Toernooi · actief";
    }
    async function start() {
      o.requireOnline();
      const actor=await o.requireActor();
      if (!actor?.id || actor.id==="__admin__") throw new Error("Kies eerst je eigen spelersnaam. De maker wordt game master.");
      const pin=await o.askAdminPin();
      const result=await o.rpc("big2_tournament_setup",{p_slug:o.config.groupSlug,p_admin_pin:pin});
      rosterSources=result.players || [];
      $("#tournament-create-form").reset();
      $("#tournament-create-error").hidden=true;
      $("#tournament-master-label").textContent=`${actor.name} wordt game master en doet automatisch mee.`;
      $("#tournament-source-players").innerHTML=sourceChips(rosterSources,[actor.id]);
      setupPin=pin;
      $("#tournament-dialog").showModal();
    }
    async function create(event) {
      event.preventDefault(); const form=event.currentTarget; setBusy(form,true);
      try {
        o.requireOnline();
        const actor=await o.requireActor();
        const result=await o.rpc("big2_tournament_create",{p_slug:o.config.groupSlug,p_admin_pin:setupPin,
          p_master_source_id:actor.id,p_name:$("#tournament-name").value.trim(),p_source_ids:checked("#tournament-source-players"),p_names:names($("#tournament-new-names").value)});
        setupPin="";
        open({token:result.token});
      } catch(error) { $("#tournament-create-error").textContent=error.message; $("#tournament-create-error").hidden=false; }
      finally { setBusy(form,false); }
    }
    async function manage(action,extra={}) {
      o.requireOnline();
      const actor=await o.requireActor();
      const next=await o.rpc("big2_tournament_manage",{p_token:token,p_actor_id:actor.id,p_action:action,...extra});
      await o.applyState(next); o.renderAll();
    }
    async function add(event) {
      event.preventDefault(); const form=event.currentTarget; setBusy(form,true);
      try {
        await manage("add",{p_source_ids:checked("#tournament-add-sources"),p_names:names($("#tournament-add-names").value)});
        $("#tournament-add-dialog").close(); o.showToast("Deelnemers toegevoegd.");
      } catch(error) { $("#tournament-add-error").textContent=error.message; $("#tournament-add-error").hidden=false; }
      finally { setBusy(form,false); }
    }
    async function rename(event) {
      if (event.target.id!=="tournament-rename-form") return;
      event.preventDefault(); const form=event.target; setBusy(form,true);
      try { await manage("rename",{p_name:form.elements.name.value.trim()}); o.showToast("Toernooinaam opgeslagen."); }
      catch(error) { o.showToast(error.message,true); }
      finally { setBusy(form,false); }
    }
    async function onAdminClick(event) {
      const button=event.target.closest("button"); if (!button) return;
      try {
        if (button.hasAttribute("data-create-tournament")) return await start();
        if (button.dataset.openTournament) return open(items.find(t=>t.id===button.dataset.openTournament));
        if (button.hasAttribute("data-copy-tournament")) {
          try { await navigator.clipboard.writeText(link()); o.showToast("Toernooilink gekopieerd."); }
          catch { $("#tournament-share-link").select(); o.showToast("Selecteer en kopieer de toernooilink."); }
        }
        if (button.hasAttribute("data-add-tournament-player")) {
          o.requireOnline();
          const result=await o.rpc("big2_tournament_roster_options",{p_token:token,p_actor_id:o.getActor()?.id});
          const used=new Set(o.getState().players.filter(p=>p.active).map(p=>p.source_player_id));
          $("#tournament-add-sources").innerHTML=sourceChips((result.players || []).filter(p=>!used.has(p.id)));
          $("#tournament-add-form").reset(); $("#tournament-add-error").hidden=true;
          $("#tournament-add-dialog").showModal();
        }
        if (button.dataset.removeTournamentPlayer) {
          if (!await o.confirm("Deelnemer verwijderen?","De speler kan geen nieuwe potjes meer spelen. Eerdere uitslagen blijven meetellen in dit toernooi.")) return;
          await manage("remove",{p_player_id:button.dataset.removeTournamentPlayer}); o.showToast("Deelnemer verwijderd.");
        }
        if (button.hasAttribute("data-close-tournament")) {
          if (await o.pendingCount()) throw new Error("Synchroniseer eerst de toernooipotjes op deze telefoon.");
          if (!await o.confirm("Toernooi afsluiten?","Controleer eerst of alle telefoons hun potjes hebben gesynchroniseerd. Hierna staat het toernooi in het archief en kunnen scores niet meer worden gewijzigd.")) return;
          button.disabled=true;
          await manage("close"); o.showToast("Toernooi afgesloten en opgenomen in het archief.");
        }
        if (button.hasAttribute("data-leave-tournament")) {
          if (await o.pendingCount()) throw new Error("Synchroniseer eerst de toernooipotjes op deze telefoon.");
          if (!await o.confirm("Toernooi verlaten?","Weet je zeker dat je toernooi wilt verlaten? Alleen deze telefoon keert terug naar de gewone app. Je blijft deelnemer.")) return;
          write(dismissKey,o.getState().tournament.id);
          location.assign(new URL("./",location.href).href);
        }
      } catch(error) { button.disabled=false; o.showToast(error.message,true); }
    }
    return { mode,token,isMaster,install,render,initialActor,selectorOptions,select,checkAutoEntry,
      storageKey: mode ? `tournament:${token}` : o.config.groupSlug };
  };
})();

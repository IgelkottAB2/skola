(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const cfg = window.SCHOOL_CONFIG || {};
  let db = null;
  let me = null;
  let active = "overview";

  const roleNames = {
    system_admin: "Systemadministratör",
    municipal_admin: "Kommunadministratör",
    principal: "Rektor",
    school_it: "Skol-IT",
    teacher: "Lärare",
    student: "Elev",
    guardian: "Vårdnadshavare"
  };

  const modules = [
    ["overview", "🏠", "Översikt", "Din startsida", "all"],
    ["messages", "✉️", "Meddelanden", "Privata meddelanden", "all"],
    ["assignments", "📝", "Uppgifter", "Uppgifter och inlämningar", "school"],
    ["exams", "📚", "Prov och resultat", "Prov och historik", "school"],
    ["grades", "🎓", "Betyg", "Betyg per ämne och termin", "school"],
    ["attendance", "📍", "Närvaro", "Närvaro och frånvaro", "all"],
    ["schedule", "📅", "Schema", "Dagens vy och veckovy", "all"],
    ["bulletin", "📢", "Anslagstavla", "Information från skolan", "all"],
    ["meetings", "🗓️", "Utvecklingssamtal", "Bokningar och tider", "meeting"],
    ["groups", "👥", "Grupparbeten", "Gruppuppgifter", "school"],
    ["class", "🏫", "Klass och lärare", "Klasslistor", "all"],
    ["notifications", "🔔", "Notiser", "Nytt som hänt", "all"],
    ["admin", "⚙️", "Administration", "Skolor och klasser", "admin"]
  ];

  const teacherRoles = ["teacher", "principal", "school_it", "municipal_admin", "system_admin"];
  const adminRoles = ["principal", "school_it", "municipal_admin", "system_admin"];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function say(message) {
    $("toast").textContent = message;
    $("toast").classList.remove("hidden");
    setTimeout(() => $("toast").classList.add("hidden"), 3500);
  }

  function currentRole() {
    return me?.role || "";
  }

  function allowed(module) {
    const access = module[4];
    if (access === "all") return true;
    if (access === "school") return true;
    if (access === "meeting") return ["guardian", ...teacherRoles].includes(currentRole());
    if (access === "admin") return adminRoles.includes(currentRole());
    return false;
  }

  function showApp(isLoggedIn) {
    $("login-view").classList.toggle("hidden", isLoggedIn);
    $("dashboard").classList.toggle("hidden", !isLoggedIn);
    $("logout").classList.toggle("hidden", !isLoggedIn);
  }

  async function loadProfile(user) {
    const { data, error } = await db.from("profiles")
      .select("id,username,display_name,role,school_id,class_id,avatar,email")
      .eq("id", user.id).maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Kontot saknar profil. Kontakta skolans administratör.");
    me = data;
  }

  function renderNav() {
    const nav = $("nav");
    nav.innerHTML = "";

    modules.filter(allowed).forEach(m => {
      const button = document.createElement("button");
      button.className = "module-card" + (active === m[0] ? " active" : "");
      button.innerHTML = `
        <span class="module-icon">${m[1]}</span>
        <span class="module-title">${esc(m[2])}</span>
        <span class="module-desc">${esc(m[3])}</span>`;
      button.addEventListener("click", () => openModule(m[0]));
      nav.appendChild(button);
    });
  }

  function heading(title, description = "") {
    return `<div class="section-head"><div><h2>${esc(title)}</h2>
      <p class="muted">${esc(description)}</p></div></div>`;
  }

  function empty(message) {
    return `<div class="empty">${esc(message)}</div>`;
  }

  function item(title, details = "") {
    return `<article class="item"><b>${esc(title)}</b>${details ? `<p>${esc(details)}</p>` : ""}</article>`;
  }

  async function rows(table, columns = "*") {
    const { data, error } = await db.from(table).select(columns)
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  }

  async function openModule(id) {
    active = id;
    renderNav();
    const area = $("content");
    area.innerHTML = "<p>Laddar…</p>";

    try {
      if (id === "overview") {
        area.innerHTML = heading("Välkommen!", "Här samlas din skolvardag.") +
          `<p>Inloggad som <b>${esc(roleNames[currentRole()] || currentRole())}</b>.</p>` +
          `<div class="stack">${modules.filter(m => allowed(m) && m[0] !== "overview")
            .slice(0, 5).map(m =>
              `<button class="item" data-open="${m[0]}">${m[1]} <b>${esc(m[2])}</b> →</button>`
            ).join("")}</div>`;
        area.querySelectorAll("[data-open]").forEach(b =>
          b.addEventListener("click", () => openModule(b.dataset.open)));
      } else if (id === "messages") {
        await showMessages(area);
      } else if (id === "assignments") {
        await showAssignments(area);
      } else if (id === "bulletin") {
        await showBulletin(area);
      } else if (id === "meetings") {
        await showMeetings(area);
      } else if (id === "class") {
        await showClass(area);
      } else if (id === "admin") {
        showAdmin(area);
      } else {
        const mapping = {
          exams: ["exams", "Prov och resultat", ["title", "subject", "exam_date", "status"]],
          grades: ["grades", "Betyg", ["subject", "term", "grade", "comment"]],
          attendance: ["attendance", "Närvaro", ["attendance_date", "status", "note"]],
          schedule: ["schedule_entries", "Schema och kalender", ["starts_at", "title", "subject", "location"]],
          groups: ["group_projects", "Grupparbeten", ["title", "description", "deadline", "status"]],
          notifications: ["notifications", "Notiser", ["title", "body", "created_at"]]
        };
        const info = mapping[id];
        if (info) await showSimpleList(area, ...info);
      }
    } catch (error) {
      area.innerHTML = heading("Kunde inte läsa informationen") +
        `<div class="notice">${esc(error.message || "Ett fel uppstod.")}</div>
        <p>Kontrollera att schema.sql har körts och att ditt konto har rätt behörighet.</p>`;
    }

    area.querySelectorAll("form[data-action]").forEach(form =>
      form.addEventListener("submit", handleForm));
  }

  async function showSimpleList(area, table, title, columns) {
    const data = await rows(table);
    const labels = {
      title: "Rubrik", body: "Meddelande", created_at: "Skapad",
      subject: "Ämne", exam_date: "Provdatum", status: "Status",
      term: "Termin", grade: "Betyg", comment: "Kommentar",
      attendance_date: "Datum", note: "Anteckning", starts_at: "Start",
      location: "Plats", description: "Beskrivning", deadline: "Deadline"
    };

    area.innerHTML = heading(title) + (data.length
      ? `<div class="stack">${data.map(r => {
          const main = r.title || r.subject || r.status || title;
          const details = columns.filter(c => c !== "title" && c !== "subject" && r[c])
            .map(c => `${labels[c] || c}: ${r[c]}`).join(" · ");
          return item(main, details);
        }).join("")}</div>`
      : empty("Inget att visa ännu."));
  }

  async function showMessages(area) {
    const data = await rows("messages", "id,sender_id,recipient_id,subject,body,created_at");

    area.innerHTML = heading("Privata meddelanden",
      "Meddelanden visas bara för deltagarna. Bilagor måste använda en privat Storage-bucket.") +
      `<details open><summary class="button secondary">Skriv meddelande</summary>
        <form data-action="send-message" class="stack">
          <label>Mottagarens användarnamn<input name="recipient_username" required></label>
          <label>Ämne<input name="subject" maxlength="160" required></label>
          <label>Meddelande<textarea name="body" maxlength="10000" required></textarea></label>
          <label>Bilaga (högst 10 MB)<input name="attachment" type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx"></label>
          <button class="button primary">Skicka meddelande</button>
        </form>
      </details><h3>Inkorg och skickade meddelanden</h3>` +
      (data.length ? `<div class="stack">${data.map(m => item(
        m.subject || "Meddelande",
        `${m.body} · ${new Date(m.created_at).toLocaleString("sv-SE")}`
      )).join("")}</div>` : empty("Inga meddelanden ännu."));
  }

  async function showAssignments(area) {
    const data = await rows("assignments", "id,title,description,subject,due_at,created_by,class_id");
    const canCreate = teacherRoles.includes(currentRole());

    area.innerHTML = heading("Uppgifter",
      "Läraren publicerar uppgifter och bedömer inlämningar.") +
      (canCreate ? `<details><summary class="button secondary">Skapa uppgift</summary>
        <form data-action="create-assignment" class="stack">
          <label>Rubrik<input name="title" required maxlength="160"></label>
          <label>Ämne<input name="subject" required maxlength="100"></label>
          <label>Beskrivning<textarea name="description" required></textarea></label>
          <label>Deadline<input type="datetime-local" name="due_at"></label>
          <button class="button primary">Publicera uppgift</button>
        </form></details>` : "") +
      (data.length ? `<div class="stack">${data.map(a => item(a.title,
        `${a.subject || ""} · ${a.description || ""}${a.due_at ? " · Deadline: " + a.due_at : ""}`
      )).join("")}</div>` : empty("Inga uppgifter publicerade ännu."));
  }

  async function showBulletin(area) {
    const data = await rows("bulletin_posts", "id,title,body,created_at,pinned");
    const canPost = teacherRoles.includes(currentRole());

    area.innerHTML = heading("Anslagstavla", "Information från skolan och klassen.") +
      (canPost ? `<details><summary class="button secondary">Publicera meddelande</summary>
        <form data-action="create-bulletin" class="stack">
          <label>Rubrik<input name="title" required maxlength="160"></label>
          <label>Text<textarea name="body" required maxlength="10000"></textarea></label>
          <label><input type="checkbox" name="pinned" style="width:auto"> Fäst högst upp</label>
          <button class="button primary">Publicera</button>
        </form></details>` : "") +
      (data.length ? `<div class="stack">${data.map(p => item(
        `${p.pinned ? "📌 " : ""}${p.title}`, p.body
      )).join("")}</div>` : empty("Inga meddelanden publicerade ännu."));
  }

  async function showMeetings(area) {
    const data = await rows("meeting_slots", "id,teacher_id,starts_at,ends_at,status,school_id");
    const canCreate = teacherRoles.includes(currentRole());

    area.innerHTML = heading("Utvecklingssamtal",
      "Lärare publicerar tider och vårdnadshavare bokar lediga tider.") +
      (canCreate ? `<details><summary class="button secondary">Lägg ut ledig tid</summary>
        <form data-action="create-slot" class="stack">
          <label>Start<input type="datetime-local" name="starts_at" required></label>
          <label>Slut<input type="datetime-local" name="ends_at" required></label>
          <button class="button primary">Publicera tid</button>
        </form></details>` : "") +
      (data.length ? `<div class="stack">${data.map(s => `
        <article class="item">
          <b>${esc(new Date(s.starts_at).toLocaleString("sv-SE"))}</b>
          <p>${esc(s.status)}</p>
          ${currentRole() === "guardian" && s.status === "available"
            ? `<button class="button primary" data-book="${s.id}">Boka tid</button>` : ""}
        </article>`).join("")}</div>` : empty("Inga tider publicerade ännu."));

    area.querySelectorAll("[data-book]").forEach(button => {
      button.addEventListener("click", async () => {
        const { error } = await db.rpc("book_meeting_slot", {
          p_slot_id: button.dataset.book
        });
        if (error) say("Bokningen misslyckades: " + error.message);
        else { say("Tiden är bokad!"); openModule("meetings"); }
      });
    });
  }

  async function showClass(area) {
    if (!me.class_id) {
      area.innerHTML = heading("Klass och lärare") + empty("Ditt konto är inte kopplat till en klass ännu.");
      return;
    }
    const { data, error } = await db.from("profiles")
      .select("display_name,username,role,avatar")
      .eq("class_id", me.class_id)
      .in("role", ["student", "teacher"])
      .order("display_name");
    if (error) throw error;

    area.innerHTML = heading("Klass och lärare", "Kontaktuppgifter visas inte i klasslistan.") +
      (data?.length ? `<div class="stack">${data.map(p => item(
        `${p.avatar || (p.role === "teacher" ? "👩‍🏫" : "🎓")} ${p.display_name}`,
        roleNames[p.role] || p.role
      )).join("")}</div>` : empty("Klasslistan är tom."));
  }

  function showAdmin(area) {
    area.innerHTML = heading("Administration",
      "Skolor och klasser hanteras av behörig personal.") +
      `<div class="stack">
        <div class="item"><h3>Skapa skola</h3>
          <form data-action="create-school" class="stack">
            <label>Skolans namn<input name="name" required maxlength="160"></label>
            <button class="button primary">Skapa skola</button>
          </form>
        </div>
        <div class="item"><h3>Skapa klass</h3>
          <form data-action="create-class" class="stack">
            <label>Klassnamn<input name="name" required maxlength="80"></label>
            <button class="button primary">Skapa klass</button>
          </form>
        </div>
      </div>
      <p class="muted small">Användarkonton och privilegierade roller skapas genom en säker administrativ rutin.</p>`;
  }

  async function handleForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const v = key => fd.get(key);
    try {
      let result;

      if (form.dataset.action === "create-bulletin") {
        result = await db.from("bulletin_posts").insert({
          title: v("title"), body: v("body"),
          author_id: me.id, school_id: me.school_id,
          class_id: me.class_id, pinned: fd.has("pinned")
        });
      }

      if (form.dataset.action === "create-assignment") {
        result = await db.from("assignments").insert({
          title: v("title"), subject: v("subject"),
          description: v("description"), due_at: v("due_at") || null,
          created_by: me.id, school_id: me.school_id, class_id: me.class_id
        });
      }

      if (form.dataset.action === "create-slot") {
        if (new Date(v("ends_at")) <= new Date(v("starts_at"))) {
          throw new Error("Sluttiden måste vara efter starttiden.");
        }
        result = await db.from("meeting_slots").insert({
          teacher_id: me.id, school_id: me.school_id,
          starts_at: new Date(v("starts_at")).toISOString(),
          ends_at: new Date(v("ends_at")).toISOString(),
          status: "available"
        });
      }

      if (form.dataset.action === "send-message") {
        const username = String(v("recipient_username")).trim().toLowerCase();
        const { data: recipient, error: findError } = await db.from("profiles")
          .select("id").eq("username", username).maybeSingle();
        if (findError) throw findError;
        if (!recipient) throw new Error("Mottagaren hittades inte.");
        if (recipient.id === me.id) throw new Error("Du kan inte skicka meddelande till dig själv.");

        const { data: message, error } = await db.from("messages").insert({
          sender_id: me.id, recipient_id: recipient.id,
          subject: v("subject"), body: v("body")
        }).select("id").single();
        if (error) throw error;

        const file = v("attachment");
        if (file && file.size) {
          if (file.size > 10 * 1024 * 1024) throw new Error("Bilagan får vara högst 10 MB.");
          const path = `${me.id}/${message.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const upload = await db.storage.from("message-attachments").upload(path, file);
          if (upload.error) throw upload.error;
          const attached = await db.from("message_attachments").insert({
            message_id: message.id, uploaded_by: me.id,
            storage_path: path, file_name: file.name,
            mime_type: file.type, size_bytes: file.size
          });
          if (attached.error) throw attached.error;
        }
        result = { error: null };
      }

      if (form.dataset.action === "create-school") {
        result = await db.from("schools").insert({ name: v("name") });
      }

      if (form.dataset.action === "create-class") {
        result = await db.from("classes").insert({
          name: v("name"), school_id: me.school_id
        });
      }

      if (result?.error) throw result.error;
      say("Sparat!");
      form.reset();
      await openModule(active);
    } catch (error) {
      say(error.message || "Det gick inte att spara.");
    }
  }

  async function start() {
    const ready = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_URL.includes("DIN_SUPABASE") &&
      !cfg.SUPABASE_ANON_KEY.includes("DIN_SUPABASE");

    if (!ready || !window.supabase) {
      $("setup-warning").classList.remove("hidden");
      return;
    }

    db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    $("login-form").addEventListener("submit", async event => {
      event.preventDefault();
      $("login-error").textContent = "";

      const username = $("username").value.trim().toLowerCase();
      const password = $("password").value;
      const email = username.includes("@")
        ? username : `${username}@accounts.igelkottskolplattform.invalid`;

      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) {
        $("login-error").textContent = "Inloggningen misslyckades. Kontrollera uppgifterna.";
        return;
      }

      try {
        const { data: { user } } = await db.auth.getUser();
        await loadProfile(user);
        enterApp();
      } catch (error) {
        await db.auth.signOut();
        $("login-error").textContent = error.message;
      }
    });

    $("logout").addEventListener("click", async () => {
      await db.auth.signOut();
      me = null;
      showApp(false);
    });

    $("home-link").addEventListener("click", event => {
      event.preventDefault();
      if (me) openModule("overview");
    });

    const { data: { session } } = await db.auth.getSession();
    if (session) {
      try {
        await loadProfile(session.user);
        enterApp();
      } catch {
        await db.auth.signOut();
      }
    }
  }

  function enterApp() {
    showApp(true);
    $("welcome").textContent = `Hej ${me.display_name || me.username}!`;
    $("role-label").textContent = roleNames[me.role] || me.role;
    $("avatar").textContent = me.avatar || "🎓";
    openModule("overview");
  }

  document.addEventListener("DOMContentLoaded", start);
})();

"use strict";

const order = new Intl.Collator("ja", { numeric: true });
const batchSize = 30;
const ui = (id) => document.getElementById(id);

function normalize(value) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60)).trim();
}

function compareName(left, right) {
  const group = (name) => {
    if (/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(name)) return 0;
    if (/^\p{Script=Latin}/u.test(name)) return 1;
    return 2;
  };
  const a = normalize(left);
  const b = normalize(right);
  return group(a) - group(b) || order.compare(a, b);
}

function compareTitle(a, b) {
  return compareName(a.titleKana || a.title, b.titleKana || b.title);
}

function findSongs(songs, { query, filters, sort }) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const result = songs.filter((song) => words.every((word) => song.searchText.includes(word))
    && Object.entries(filters).every(([key, selected]) =>
      !selected.size || [song[key]].flat().some((value) => selected.has(value))));
  if (sort === "title") result.sort(compareTitle);
  if (sort === "artist") result.sort((a, b) =>
    compareName(a.artistKana || a.artist, b.artistKana || b.artist) || compareTitle(a, b));
  if (sort === "gift") result.sort((a, b) => (a.coins ?? Infinity) - (b.coins ?? Infinity) || compareTitle(a, b));
  return result;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const use = document.createElementNS(ns, "use");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}

function giftText(coins) {
  return coins.toLocaleString("ja-JP") + "コイン";
}

function copyWithSelection(text, button) {
  const field = element("textarea", "clipboard-field");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  (button.closest("dialog") || document.body).append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    button.focus({ preventScroll: true });
  }
}

async function copyText(text, button) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Try selection-based copying when the Clipboard API is unavailable or denied.
    }
  }
  return copyWithSelection(text, button);
}

function initialize(data, showGifts = true, randomListActive = false) {
  const songs = data.map((song) => ({
    ...song,
    giftId: song.giftId ?? String(song.coins),
    labels: song.signature ? ["超オハコ", ...song.tags] : song.tags,
    searchText: normalize([song.title, song.artist, song.titleKana, song.artistKana].filter(Boolean).join(" ")),
  }));
  const randomListSongs = randomListActive ? songs.filter((song) => song.randomEligible) : null;
  const query = ui("query");
  const sort = ui("sort");
  const list = ui("songs");
  const sentinel = ui("sentinel");
  const random = ui("random");
  const dialog = ui("random-result");
  const feedback = ui("feedback");
  const menu = ui("filter-menu");
  if (!showGifts) menu.setAttribute("data-three-filters", "");
  const options = ui("filter-options");
  const giftNames = new Map(songs.map((song) => [song.giftId, song.coins === null ? song.giftName : giftText(song.coins)]));
  const giftNameCounts = new Map();
  for (const name of giftNames.values()) giftNameCounts.set(name, (giftNameCounts.get(name) || 0) + 1);
  const giftFilterName = (id) => {
    const name = giftNames.get(id);
    return giftNameCounts.get(name) > 1 ? name + "（ID " + id.replace(/^id:/, "") + "）" : name;
  };
  const definitions = [
    ["genres", "ジャンル", "note"],
    ["moods", "雰囲気", "sparkles"],
    ["tags", "タグ", "tag"],
    ...(showGifts ? [["giftId", "ギフト", "gift", giftFilterName]] : []),
  ];
  const filters = Object.fromEntries(definitions.map(([key]) => [key, new Set()]));
  filters.signature = new Set();
  const summaries = new Map();
  let matched = [];
  let visible = 0;
  let active = null;
  let notification;

  function showFeedback(message) {
    clearTimeout(notification);
    feedback.hidden = false;
    feedback.textContent = message;
    notification = setTimeout(() => { feedback.hidden = true; }, 2500);
  }

  async function copyTitle(title, button) {
    if (await copyText(title, button)) {
      showFeedback("曲名をコピーしました");
    } else {
      window.prompt("曲名を選択してコピーしてください。", title);
    }
  }

  function card(song, tag = "li") {
    const row = element(tag, "song");
    const note = element("span", "note");
    note.append(icon("note"));
    const heading = element("div", "song-heading");
    heading.append(element("h2", "", song.title));
    if (song.artist) heading.append(element("p", "artist", song.artist));
    const labels = element("div", "labels");
    for (const genre of song.genres) labels.append(element("span", "label genre", genre));
    if (showGifts) {
      const tier = song.coins === null ? "" : song.coins <= 500 ? "small" : song.coins <= 2599 ? "medium" : "large";
      const gift = element("span", "label " + tier);
      gift.append(icon("gift"), giftNames.get(song.giftId));
      labels.append(gift);
    }
    for (const [values, group] of [[song.moods, "mood"], [song.labels, ""]]) {
      for (const value of values) labels.append(element("span", "label " + group, value));
    }
    const copy = element("button", "copy");
    copy.type = "button";
    copy.setAttribute("aria-label", song.title + "の曲名をコピー");
    copy.append(icon("copy"));
    copy.addEventListener("click", () => copyTitle(song.title, copy));
    row.append(note, heading, labels, copy);
    return row;
  }

  const observer = typeof IntersectionObserver === "undefined" ? null :
    new IntersectionObserver(([entry]) => { if (entry.isIntersecting) appendBatch(); }, { rootMargin: "180px" });

  function appendBatch() {
    const next = matched.slice(visible, visible + batchSize);
    list.append(...next.map((song) => card(song)));
    visible += next.length;
    if (visible >= matched.length) observer?.unobserve(sentinel);
  }

  function refresh() {
    matched = findSongs(songs, { query: query.value, filters, sort: sort.value });
    ui("count").textContent = matched.length.toLocaleString("ja-JP");
    ui("empty").hidden = matched.length > 0;
    random.disabled = randomListSongs === null && matched.length === 0;
    observer?.unobserve(sentinel);
    visible = 0;
    list.replaceChildren();
    appendBatch();
    if (visible < matched.length) {
      if (observer) observer.observe(sentinel);
      else while (visible < matched.length) appendBatch();
    }
  }

  function closeOptions() {
    if (active) active.button.setAttribute("aria-expanded", "false");
    options.replaceChildren();
    active = null;
  }

  for (const [key, label, image, format = (value) => value] of definitions) {
    const values = [...new Set(songs.flatMap((song) => song[key]))].sort(order.compare);
    const button = element("button");
    const text = element("span", "", label);
    const summary = element("small", "", "指定なし");
    summaries.set(key, summary);
    text.append(summary);
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "filter-options");
    button.append(icon(image), text, icon("chevron"));
    button.addEventListener("click", () => {
      const wasActive = active?.button === button;
      closeOptions();
      if (wasActive) return;
      const panel = element("div", "filter-options");
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", label);
      const selected = filters[key];
      for (const value of key === "tags" ? ["超オハコ", ...values] : values) {
        const isSignature = value === "超オハコ";
        const group = isSignature ? filters.signature : selected;
        const filterValue = isSignature ? true : value;
        const choice = element("button", "", format(value));
        choice.type = "button";
        choice.setAttribute("aria-pressed", String(group.has(filterValue)));
        choice.addEventListener("click", () => {
          if (group.has(filterValue)) group.delete(filterValue);
          else group.add(filterValue);
          choice.setAttribute("aria-pressed", String(group.has(filterValue)));
          const current = [...selected].map(format);
          if (key === "tags" && filters.signature.size) current.unshift("超オハコ");
          summary.textContent = current.length === 1 ? current[0] :
            current.length ? current.length + "件選択" : "指定なし";
          refresh();
        });
        panel.append(choice);
      }
      options.append(panel);
      button.setAttribute("aria-expanded", "true");
      active = { button };
      panel.querySelector("button")?.focus();
    });
    menu.append(button);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-panel")) closeOptions();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) {
      active.button.focus();
      closeOptions();
    }
  });
  ui("reset").addEventListener("click", () => {
    query.value = "";
    sort.value = "artist";
    for (const selected of Object.values(filters)) selected.clear();
    for (const summary of summaries.values()) summary.textContent = "指定なし";
    closeOptions();
    refresh();
  });
  query.form.addEventListener("submit", (event) => {
    event.preventDefault();
    closeOptions();
    refresh();
    query.blur();
  });
  query.addEventListener("input", refresh);
  sort.addEventListener("change", refresh);
  random.addEventListener("click", () => {
    const candidates = randomListSongs ?? matched;
    if (!candidates.length) {
      if (randomListActive) showFeedback("指定のランダムリストに公開曲がありません。");
      return;
    }
    const song = candidates[Math.floor(Math.random() * candidates.length)];
    ui("selected-song").replaceChildren(card(song, "article"));
    dialog.showModal();
  });
  refresh();
}

if (Array.isArray(globalThis.asanekoSongs)) {
  initialize(globalThis.asanekoSongs);
} else {
  ui("empty").textContent = "曲データを読み込めませんでした。";
  initialize([], false);
}

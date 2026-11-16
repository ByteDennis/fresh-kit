// Reload settings and custom keybindings from disk.
async function reload_user_config(): Promise<void> {
  editor.reloadConfig();
  await editor.flush();
  await editor.reloadInit();
}
registerHandler("reload_user_config", reload_user_config);
editor.registerCommand("Reload User Config", "Reload configuration and init.ts", "reload_user_config");

// A searchable, context-filtered view of user-defined keybindings.
const KEYS_PANEL = 38472;
const KEYS_MODE = "custom-keys-panel";
const keysState = { context: "All", query: "", selected: 0, count: 0 };
function user_key_label(binding: FreshConfig.Keybinding): string {
  const fmt = (key: string | undefined, mods: string[] | undefined) =>
    [...(mods ?? []).map(m => m.charAt(0).toUpperCase() + m.slice(1)), key ?? "?"].join("+");
  return binding.keys?.length ? binding.keys.map(k => fmt(k.key, k.modifiers)).join(" → ") :
    binding.chord || fmt(binding.key, binding.modifiers);
}
function keysContexts(): string[] {
  const contexts = (editor.getUserConfig().keybindings ?? []).filter(b => b.action !== "noop" && b.action !== "unbind").map(b => b.when || "normal");
  const groups = contexts.map(ctx => ctx.startsWith("mode:vi-") ? "group:vi" : ctx);
  return ["All", ...Array.from(new Set(groups.filter(x => x !== "All"))).sort()];
}
function keysRows(): { text: string; properties: Record<string, unknown> }[] {
  const terms = keysState.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows = (editor.getUserConfig().keybindings ?? []).filter(b => {
    const ctx = b.when || "normal";
    const value = `${user_key_label(b)} ${b.action ?? "?"} ${ctx}`.toLowerCase();
    return (keysState.context === "All" || keysState.context === ctx || (keysState.context === "group:vi" && ctx.startsWith("mode:vi-"))) && terms.every(t => value.includes(t));
  }).filter(b => b.action !== "unbind" && b.action !== "noop").map(b => ({ text: `${user_key_label(b).padEnd(28)} ${b.action ?? "?"}  [${b.when || "normal"}]`, properties: {} }));
  if (keysState.context === "All" || keysState.context === "file_explorer") {
    for (const [key, label] of [["a → d", "Create directory"], ["a → f", "Create file"], ["c → y", "Copy"], ["c → x", "Cut"], ["c → p", "Paste"], ["c → d", "Delete"], ["c → n", "Rename"], ["c → u", "Duplicate"]]) if (terms.every(t => `${key} ${label} file_explorer`.toLowerCase().includes(t))) rows.push({text: `${key.padEnd(28)} ${label}  [file_explorer]`, properties: {}});
  }
  keysState.count = rows.length;
  return rows;
}
function keysContextLabel(ctx: string): string {
  const labels: Record<string,string> = {"All":"All","file_explorer":"Files","mode:python-debug-panel":"Debug","mode:special":"Help","group:vi":"Vi","normal":"Edit","prompt":"Prompt"};
  return labels[ctx] ?? ctx.replace(/^mode:/, "");
}
function keysButton(key: string, label: string, selected: boolean) {
  return { kind: "button", key, label, intent: selected ? "primary" : "normal", focused: false, disabled: false, focusable: true, bare: false, fullWidth: false };
}
function keysSpec() {
  const rows = keysRows();
  return { kind: "col", children: [
    { kind: "label", text: "  YOUR SHORTCUTS", labelWidth: 0, wrap: false, elide: "tail" },
    { kind: "row", wrap: true, children: keysContexts().map((ctx, i) => keysButton(`tab-${i}`, keysContextLabel(ctx), ctx === keysState.context)) },
    { kind: "text", key: "filter", label: "Search", value: keysState.query, placeholder: "Search keys or actions", labelWidth: 7, fullWidth: true, cursorByte: -1, focused: true, rows: 1, minRows: 0, maxRows: 0, fieldWidth: 0, maxVisibleChars: 0, completions: [], blockCaret: false, selStart: -1, selEnd: -1, readOnly: false, markdown: false, combo: false },
    { kind: "list", key: "results", items: rows, itemKeys: rows.map((_, i) => `row-${i}`), selectedIndex: Math.min(keysState.selected, Math.max(0, rows.length - 1)), visibleRows: 12, focusable: true, typeAhead: false },
    { kind: "label", text: `${rows.length} shortcuts    Tab: filters    Ctrl+D/U: page    Ctrl+Shift+/: close`, labelWidth: 0, wrap: false, elide: "tail" },
  ] };
}
function keysRefresh() {
  editor.updateFloatingWidget(KEYS_PANEL, keysSpec());
  keysState.selected = Math.min(keysState.selected, Math.max(0, keysState.count - 1));
  editor.widgetMutate(KEYS_PANEL, { kind: "setSelectedIndex", widgetKey: "results", index: keysState.selected });
}
function keysMove(delta: number) {
  keysState.selected = Math.max(0, Math.min(keysState.count - 1, keysState.selected + delta));
  editor.widgetMutate(KEYS_PANEL, { kind: "setSelectedIndex", widgetKey: "results", index: keysState.selected });
}
registerHandler("keys_down", () => keysMove(1));
registerHandler("keys_up", () => keysMove(-1));
registerHandler("keys_page_down", () => keysMove(10));
registerHandler("keys_page_up", () => keysMove(-10));
registerHandler("keys_close", () => editor.unmountFloatingWidget(KEYS_PANEL));
editor.defineMode(KEYS_MODE, [["C-S-/", "keys_close"], ["C-j", "keys_down"], ["C-k", "keys_up"], ["C-d", "keys_page_down"], ["C-u", "keys_page_up"], ["q", "keys_close"]], true, true);
function user_keys_show(context: string): void {
  keysState.context = context; keysState.query = ""; keysState.selected = 0;
  editor.mountFloatingWidget(KEYS_PANEL, keysSpec(), 85, 80, false, true, "Keys", true, false, KEYS_MODE);
  editor.widgetMutate(KEYS_PANEL, { kind: "setFocusKey", widgetKey: "filter" });
}
function user_keys_open(): void { user_keys_show("All"); }
function user_keys_explorer(): void { user_keys_show("file_explorer"); }
registerHandler("user_keys_open", user_keys_open);
registerHandler("user_keys_explorer", user_keys_explorer);
editor.registerCommand("Keys: Explorer", "Show explorer shortcuts", "user_keys_explorer");
editor.on("widget_event", (e) => {
  if (e.panel_id !== KEYS_PANEL) return;
  if (e.widget_key === "filter" && e.event_type === "change") {
    keysState.query = String(e.payload?.value ?? ""); keysState.selected = 0; keysRefresh();
  } else if (e.event_type === "activate" && e.widget_key.startsWith("tab-")) {
    const context = keysContexts()[Number(e.widget_key.slice(4))];
    if (context) { keysState.context = context; keysState.selected = 0; keysRefresh(); }
  } else if (e.widget_key === "results" && e.event_type === "select") {
    if (typeof e.payload?.index === "number") keysState.selected = e.payload.index;
  }
});
editor.registerCommand("Keys", "Search custom keybindings by context", "user_keys_open");

// File Explorer: lf-style add prefix with visible choices.
const LF_ADD_PANEL = 38473;
const LF_ADD_MODE = "explorer-add-menu";
function lfAddButton(key: string, label: string) {
  return { kind: "button", key, label, intent: "normal", focused: false, disabled: false, focusable: true, bare: false, fullWidth: false };
}
async function lfAddChoose(action: string): Promise<void> {
  editor.unmountFloatingWidget(LF_ADD_PANEL);
  await editor.flush();
  editor.executeAction(action);
}
registerHandler("lf_add_directory", () => lfAddChoose("file_explorer_new_directory"));
registerHandler("lf_add_file", () => lfAddChoose("file_explorer_new_file"));
editor.defineMode(LF_ADD_MODE, [["d", "lf_add_directory"], ["f", "lf_add_file"]], true, false);
registerHandler("lf_add_menu", () => {
  editor.mountFloatingWidget(LF_ADD_PANEL, { kind: "col", children: [
    lfAddButton("directory", "d  Add directory"),
    lfAddButton("file", "f  Add file"),
    { kind: "label", text: "Esc  Cancel", labelWidth: 0, wrap: false, elide: "tail" },
  ] }, 36, 25, false, true, "Add", true, false, LF_ADD_MODE);
});
editor.on("widget_event", (e) => {
  if (e.panel_id !== LF_ADD_PANEL || e.event_type !== "activate") return;
  if (e.widget_key === "directory") void lfAddChoose("file_explorer_new_directory");
  if (e.widget_key === "file") void lfAddChoose("file_explorer_new_file");
});
editor.registerCommand("Explorer: Add", "Show file and directory creation choices", "lf_add_menu");

// File Explorer command menus, scoped to the file tree.
const LF_COMMAND_PANEL = 38474;
const LF_COMMAND_MODE = "explorer-command-menu";
const lfCommands: Record<string, { label: string; action: string }> = {
  y: { label: "y  Copy", action: "file_explorer_copy" },
  x: { label: "x  Cut", action: "file_explorer_cut" },
  p: { label: "p  Paste", action: "file_explorer_paste" },
  d: { label: "d  Delete (confirm)", action: "file_explorer_delete" },
  n: { label: "n  Rename", action: "file_explorer_rename" },
  u: { label: "u  Duplicate", action: "file_explorer_duplicate" },
  f: { label: "f  Copy full path", action: "file_explorer_copy_full_path" },
  r: { label: "r  Copy relative path", action: "file_explorer_copy_relative_path" },
};
async function lfCommandChoose(key: string): Promise<void> {
  const command = lfCommands[key];
  if (!command) return;
  editor.unmountFloatingWidget(LF_COMMAND_PANEL);
  await editor.flush();
  editor.executeAction(command.action);
}
for (const key of Object.keys(lfCommands)) registerHandler(`lf_command_${key}`, () => lfCommandChoose(key));
editor.defineMode(LF_COMMAND_MODE, Object.keys(lfCommands).map(key => [key, `lf_command_${key}`]), true, false);
registerHandler("lf_command_menu", () => {
  editor.mountFloatingWidget(LF_COMMAND_PANEL, { kind: "col", children: [
    ...Object.entries(lfCommands).map(([key, command]) => lfAddButton(key, command.label)),
    { kind: "label", text: "Esc  Cancel", labelWidth: 0, wrap: false, elide: "tail" },
  ] }, 40, 40, false, true, "File commands", true, false, LF_COMMAND_MODE);
});
editor.on("widget_event", (e) => {
  if (e.panel_id === LF_COMMAND_PANEL && e.event_type === "activate") void lfCommandChoose(e.widget_key);
});
editor.registerCommand("Explorer: File commands", "Show file tree commands", "lf_command_menu");


// Large, read-only companion to the built-in file explorer.
const FLOAT_TREE_PANEL = 38475;
const FLOAT_TREE_MODE = "floating-file-browser";
type FloatEntry = { path: string; name: string; depth: number; dir: boolean; parent?: boolean };
const floatTree = { root: "", expanded: new Set<string>(), entries: [] as FloatEntry[], selected: 0, filter: "", showHidden: false };
type FloatHistory = { root: string; expanded: string[]; selectedPath: string | null; filter: string };
const floatHistory: FloatHistory[] = [];
const floatMeta = new Map<string, { size: number; mtime: number; date: string }>();
let floatSort = "name";
let floatRevision = 0;
function floatBuildEntries(): FloatEntry[] {
  const result: FloatEntry[] = [];
  function walk(path: string, depth: number) {
    const entries = editor.readDir(path).filter(e => floatTree.showHidden || !e.name.startsWith("."));
    entries.sort((a, b) => {
      const am = floatMeta.get(editor.pathJoin(path, a.name)), bm = floatMeta.get(editor.pathJoin(path, b.name));
      const order = floatSort === "size" ? (bm?.size ?? -1) - (am?.size ?? -1) : floatSort === "time" ? (bm?.mtime ?? -1) - (am?.mtime ?? -1) : 0;
      return Number(b.is_dir) - Number(a.is_dir) || order || a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"});
    });
    for (const entry of entries) {
      const full = editor.pathJoin(path, entry.name);
      result.push({path: full, name: entry.name, depth, dir: entry.is_dir});
      if (entry.is_dir && floatTree.expanded.has(full) && depth < 40) walk(full, depth + 1);
    }
  }
  walk(floatTree.root, 0);
  const visible = floatTree.filter ? result.filter(e => e.path.toLowerCase().includes(floatTree.filter.toLowerCase())) : result;
  const parent = editor.pathDirname(floatTree.root);
  if (parent && parent !== floatTree.root) visible.unshift({path: parent, name: "..", depth: 0, dir: true, parent: true});
  return visible;
}
function floatCellWidth(text: string): number { let width = 0; for (const ch of text) { const cp = ch.codePointAt(0) ?? 0; width += cp >= 0x1100 && (cp <= 0x115f || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe10 && cp <= 0xfe6f || cp >= 0xff00 && cp <= 0xff60 || cp >= 0x1f300) ? 2 : 1; } return width; }
function floatFit(text: string, width: number): string {
  let out = ""; for (const ch of text) { if (floatCellWidth(out + ch) > width) break; out += ch; }
  return out + " ".repeat(Math.max(0, width - floatCellWidth(out)));
}
function floatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["K", "M", "G", "T"]; let value = n / 1024, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
function floatTreeSpec() {
  const panelWidth = Math.max(36, Math.floor(editor.getScreenSize().width * 0.85) - 4);
  const nameWidth = Math.max(10, panelWidth - 31);
  const rows = floatTree.entries.map(e => {
    const title = e.parent ? "  .." : `  ${"│  ".repeat(e.depth)}${e.dir ? (floatTree.expanded.has(e.path) ? "▾  " : "▸  ") : "·  "}${e.name}${e.dir ? "/" : ""}`;
    const info = floatMeta.get(e.path);
    return {text: floatFit(title, nameWidth) + "  " + (info && !e.dir ? floatSize(info.size) : "—").padStart(8) + "  " + (info?.date ?? "—").padEnd(16), properties: {}};
  });
  const footer = floatCommands ? "  c: y copy  x cut  p paste  u duplicate  n rename  d trash  q cancel" : floatAdding ? "  a:  d directory   f file   q cancel" : floatSorting ? "  s:  n name   s size   t modified   q cancel" : "";
  return {kind:"col", children:[
    {kind:"row", wrap:false, children:[{kind:"label",text:`  ${floatTree.root}`,labelWidth:0,wrap:false,elide:"head"},{kind:"spacer",cols:0,flex:true},{kind:"label",text:"? help  ",labelWidth:0,wrap:false,elide:"tail"}]},
    {kind:"label",text:floatFit("Name",nameWidth - 2) + "  " + "Size".padStart(8) + "  Modified",labelWidth:0,wrap:false,elide:"tail"},
    ...(floatTree.filter ? [{kind:"label",text:`  Filter: ${floatTree.filter}`,labelWidth:0,wrap:false,elide:"tail"}] : []),
    {kind:"list",key:"files",items:rows,itemKeys:floatTree.entries.map(e=>e.path),selectedIndex:floatTree.selected,visibleRows:Math.max(8,Math.floor(editor.getScreenSize().height*0.94)-7),focusable:true,typeAhead:false},
    {kind:"label",text:footer,labelWidth:0,wrap:false,elide:"tail"},
  ]};
}
function floatRefresh() {
  const path = floatTree.entries[floatTree.selected]?.path;
  floatTree.entries = floatBuildEntries();
  const next = path ? floatTree.entries.findIndex(e => e.path === path) : -1;
  floatTree.selected = Math.max(0, Math.min(next >= 0 ? next : floatTree.selected, floatTree.entries.length - 1));
  editor.updateFloatingWidget(FLOAT_TREE_PANEL, floatTreeSpec());
  editor.widgetMutate(FLOAT_TREE_PANEL, {kind: "setSelectedIndex", widgetKey: "files", index: floatTree.selected});
  void floatLoadMetadata();
}
async function floatLoadMetadata() {
  const rev = ++floatRevision;
  const paths = floatTree.entries.filter(e => !e.parent).map(e => e.path);
  if (!paths.length) return;
  const program = `import sys,json,os,datetime\nout={}\nfor p in json.loads(sys.argv[1]):\n try:\n  s=os.stat(p); out[p]=[s.st_size,s.st_mtime,datetime.datetime.fromtimestamp(s.st_mtime).strftime("%Y-%m-%d %H:%M")]\n except OSError: pass\nprint(json.dumps(out))`;
  try {
    const result = await editor.spawnProcess(FRESH_KIT_PYTHON, ["-c", program, JSON.stringify(paths)]);
    if (rev !== floatRevision || result.exit_code !== 0) return;
    const data = JSON.parse(result.stdout);
    for (const path of Object.keys(data)) floatMeta.set(path, {size: data[path][0], mtime: data[path][1], date: data[path][2]});
    if (floatShowingHelp || floatShowingInfo) return;
    const selectedPath = floatTree.entries[floatTree.selected]?.path;
    floatTree.entries = floatBuildEntries();
    const index = floatTree.entries.findIndex(e => e.path === selectedPath);
    floatTree.selected = Math.max(0, index);
    editor.updateFloatingWidget(FLOAT_TREE_PANEL, floatTreeSpec());
    editor.widgetMutate(FLOAT_TREE_PANEL, {kind: "setSelectedIndex", widgetKey: "files", index: floatTree.selected});
  } catch (_) { /* Metadata is optional. */ }
}
function floatMove(delta: number) {
  floatTree.selected = Math.max(0, Math.min(floatTree.entries.length - 1, floatTree.selected + delta));
  editor.widgetMutate(FLOAT_TREE_PANEL, {kind: "setSelectedIndex", widgetKey: "files", index: floatTree.selected});
}
function floatParent() {
  const parent = editor.pathDirname(floatTree.root);
  if (!parent || parent === floatTree.root) return;
  floatHistory.push({root: floatTree.root, expanded: [...floatTree.expanded], selectedPath: floatTree.entries[floatTree.selected]?.path ?? null, filter: floatTree.filter});
  const previousRoot = floatTree.root;
  floatTree.root = parent; floatTree.expanded = new Set(); floatTree.filter = ""; floatTree.entries = []; floatTree.selected = 0; floatRefresh();
  const index = floatTree.entries.findIndex(e => !e.parent && e.path === previousRoot);
  if (index >= 0) floatMove(index - floatTree.selected);
}
function floatBack() {
  const previous = floatHistory.pop(); if (!previous) return;
  floatTree.root = previous.root; floatTree.expanded = new Set(previous.expanded); floatTree.filter = previous.filter; floatTree.entries = []; floatTree.selected = 0; floatRefresh();
  const index = floatTree.entries.findIndex(e => e.path === previous.selectedPath);
  if (index >= 0) floatMove(index - floatTree.selected);
}
function floatExpand() {
  const item = floatTree.entries[floatTree.selected]; if (!item) return;
  if (item.parent) { floatParent(); return; }
  if (item.dir) { floatTree.expanded.add(item.path); floatRefresh(); }
  else { editor.unmountFloatingWidget(FLOAT_TREE_PANEL); editor.openFile(item.path); }
}
function floatCollapse() {
  const item = floatTree.entries[floatTree.selected]; if (!item) return;
  if (item.dir && floatTree.expanded.has(item.path)) { floatTree.expanded.delete(item.path); floatRefresh(); return; }
  for (let i = floatTree.selected - 1; i >= 0; i--) if (floatTree.entries[i].depth < item.depth) { floatMove(i - floatTree.selected); return; }
}
let floatShowingInfo = false;
let floatInfoPath = "";
let floatInfoSequence = 0;
let floatShowingHelp = false;
let floatAdding = false;
let floatSorting = false;
let floatCommands = false;
let floatClipboard: {path:string; cut:boolean} | null = null;
let floatProjectRoot = "";
const FLOAT_HELP_LINES = ["  NAVIGATION", "  j / k       Move up / down", "  l / h       Expand / collapse", "  Enter       Open file or toggle folder", "  ..          Go to parent directory", "  b           Return to previous directory", "", "  BROWSE", "  /           Filter visible entries", "  f           Find a project file", "  s           Sort: name / size / modified", "  a d / a f   Create directory / file", "  c y/x/u/n/d Locate file for sidebar action", "  c p         Paste in sidebar (select destination)", "  i           File details / copy path", "  .           Toggle hidden files", "  W           Collapse all folders", "  z / q       Close browser", "", "  ? / q       Return to browser"];
function floatHelp() { floatShowingHelp = !floatShowingHelp; if (floatShowingHelp) editor.updateFloatingWidget(FLOAT_TREE_PANEL, {kind:"col", children: FLOAT_HELP_LINES.map(text => ({kind:"label",text,labelWidth:0,wrap:false,elide:"tail"}))}); else floatRefresh(); }
registerHandler("float_help", floatHelp);
function floatAddMenu() { floatAdding = true; floatSorting = false; floatCommands = false; editor.updateFloatingWidget(FLOAT_TREE_PANEL, floatTreeSpec()); }
async function floatCreate(dir: boolean) {
  if (!floatAdding) return;
  floatAdding = false; floatRefresh();
  const item = floatTree.entries[floatTree.selected];
  const parent = item && item.dir && !item.parent ? item.path : item && !item.parent ? editor.pathDirname(item.path) : floatTree.root;
  const name = await editor.prompt(dir ? "New directory name: " : "New file name: ", "");
  if (name === null || !name.trim()) return;
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) { editor.setStatus("Enter a single file or directory name"); return; }
  const target = editor.pathJoin(parent, name);
  if (editor.fileExists(target)) { editor.setStatus("Already exists: " + name); return; }
  const ok = dir ? editor.createDir(target) : editor.writeFile(target, "");
  if (!ok) { editor.setStatus("Could not create: " + name); return; }
  if (parent !== floatTree.root) floatTree.expanded.add(parent);
  floatRefresh(); editor.setStatus("Created: " + name);
}
registerHandler("float_tree_add", floatAddMenu);
registerHandler("float_tree_add_dir", () => { if (floatCommands) return floatFileAction("delete"); return floatCreate(true); });
function floatCommandMenu() { floatCommands = true; floatAdding = false; floatSorting = false; editor.updateFloatingWidget(FLOAT_TREE_PANEL, floatTreeSpec()); }
async function floatHandoff(operation: string) {
  if (!floatCommands) return;
  const item = floatTree.entries[floatTree.selected];
  if (!item || item.dir || item.parent) { editor.setStatus("Select a file in the project; folders are not supported"); return; }
  const root = floatProjectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = item.path.replace(/\\/g, "/");
  if (!(normalizedPath.startsWith(root + "/") || (root === "" && normalizedPath.startsWith("/")))) { editor.setStatus("File is outside the project; cannot locate in sidebar"); return; }
  const path = item.path;
  floatCommands = false;
  editor.unmountFloatingWidget(FLOAT_TREE_PANEL);
  await editor.flush();
  editor.openFile(path);
  await editor.flush();
  editor.executeAction("focus_file_explorer");
  await editor.flush();
  const keys: Record<string,string> = {rename:"n",delete:"d",copy:"y",cut:"x",duplicate:"u"};
  editor.setStatus(`Check selection; then c ${keys[operation]}: ${path}`);
}
function floatInfoView(path: string, details: string[]) {
  editor.updateFloatingWidget(FLOAT_TREE_PANEL, {kind:"col",children:[
    {kind:"label",text:"  DETAILS",labelWidth:0,wrap:false,elide:"tail"},
    {kind:"label",text:"",labelWidth:0,wrap:false,elide:"tail"},
    {kind:"label",text:`  Path: ${path}`,labelWidth:0,wrap:false,elide:"head"},
    ...details.map(text => ({kind:"label",text:`  ${text}`,labelWidth:0,wrap:false,elide:"tail"})),
    {kind:"label",text:"",labelWidth:0,wrap:false,elide:"tail"},
    {kind:"label",text:"  y  Copy absolute path     i / q  Back",labelWidth:0,wrap:false,elide:"tail"},
  ]});
}
async function floatInfo() {
  if (floatShowingInfo) { floatShowingInfo=false; floatInfoSequence++; floatRefresh(); return; }
  const item = floatTree.entries[floatTree.selected]; if (!item) return;
  const path = item.parent ? floatTree.root : item.path;
  floatShowingInfo=true; floatInfoPath=path; const seq=++floatInfoSequence;
  floatInfoView(path,["Loading…"]);
  const program = `import os,sys,json,datetime,subprocess\np=sys.argv[1]\ns=os.stat(p)\nisdir=os.path.isdir(p)\nsize=str(s.st_size)+" bytes"\nif isdir:\n try:\n  r=subprocess.run(["du","-shx","--",p],capture_output=True,text=True,timeout=4)\n  size=r.stdout.split("\\t",1)[0]+" (directory, same filesystem)" if r.returncode==0 else "Unavailable"\n except (OSError,subprocess.TimeoutExpired): size="Unavailable or timed out"\nprint(json.dumps({"type":"Directory" if isdir else "File","size":size,"modified":datetime.datetime.fromtimestamp(s.st_mtime).strftime("%Y-%m-%d %H:%M:%S")}))`;
  try { const r=await editor.spawnProcess(FRESH_KIT_PYTHON,["-c",program,path]);
    if (!floatShowingInfo || seq!==floatInfoSequence) return;
    if (r.exit_code!==0) { floatInfoView(path,["Details unavailable"]); return; }
    const d=JSON.parse(r.stdout); floatInfoView(path,[`Type: ${d.type}`,`Size: ${d.size}`,`Modified: ${d.modified}`]);
  } catch (_) { if(floatShowingInfo && seq===floatInfoSequence) floatInfoView(path,["Details unavailable"]); }
}
registerHandler("float_tree_info", floatInfo);
registerHandler("float_tree_commands", floatCommandMenu);
function floatOpenPaths(): string[] { return editor.listWindows().flatMap(w => editor.listBuffers(w.id).map(b => b.path).filter(Boolean)); }
async function floatDiskOperation(op: string, source: string, destination: string): Promise<string> {
  try { const r = await editor.spawnProcess(FRESH_KIT_PYTHON, [editor.pathJoin(PYDBG_DIR,"file_ops.py"),op,source,destination,JSON.stringify(floatOpenPaths())]); return r.exit_code === 0 ? "" : (r.stderr.trim() || "Operation failed"); }
  catch (_) { return "Cannot run filesystem operation"; }
}
async function floatFileAction(op: string) {
  if (!floatCommands) return;
  const item = floatTree.entries[floatTree.selected];
  if (!item || item.parent || item.dir) { editor.setStatus("Select a regular file; folders use the sidebar"); return; }
  if (op === "copy" || op === "cut") { floatClipboard = {path:item.path,cut:op === "cut"}; floatCommands = false; floatRefresh(); editor.setStatus(`${op === "cut" ? "Cut" : "Copied"}: ${item.name}`); return; }
  let destination = "";
  if (op === "rename") {
    const name = await editor.prompt("Rename to: ", item.name);
    if (name === null || !name.trim()) return;
    if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) { editor.setStatus("Enter a single file name"); return; }
    destination = editor.pathJoin(editor.pathDirname(item.path),name);
    if (destination === item.path) { floatCommands=false; floatRefresh(); return; }
  } else if (op === "duplicate") {
    const dot=item.name.lastIndexOf("."); const stem=dot>0?item.name.slice(0,dot):item.name; const ext=dot>0?item.name.slice(dot):"";
    let n=1; do { destination=editor.pathJoin(editor.pathDirname(item.path), `${stem} copy${n===1?"":" "+n}${ext}`); n++; } while(editor.fileExists(destination) && n < 10000);
  } else if (op === "delete") {
    const confirm = await editor.prompt(`Move ${item.name} to trash? Type yes: `, "");
    if (confirm !== "yes") return;
  }
  const error = await floatDiskOperation(op,item.path,destination);
  if (error.includes("OPEN_BUFFER")) { await floatHandoff(op); return; }
  if (error) { editor.setStatus(`Failed: ${error}`); return; }
  floatCommands=false; floatRefresh(); editor.setStatus(`${op}: ${item.name}`);
}
async function floatPaste() {
  if (!floatCommands) return;
  if (!floatClipboard) { editor.setStatus("Clipboard is empty"); return; }
  const item=floatTree.entries[floatTree.selected];
  const dir=item?.dir && !item.parent ? item.path : item && !item.parent ? editor.pathDirname(item.path) : floatTree.root;
  const name=floatClipboard.path.split(/[\\/]/).pop() ?? ""; const target=editor.pathJoin(dir,name);
  if (editor.fileExists(target)) { editor.setStatus("Destination exists; no file was overwritten"); return; }
  const error=await floatDiskOperation(floatClipboard.cut?"move":"copy",floatClipboard.path,target);
  if (error) { editor.setStatus(error.includes("OPEN_BUFFER") ? "File is open; use the sidebar to move it" : `Paste failed: ${error}`); return; }
  if (floatClipboard.cut) floatClipboard=null;
  floatCommands=false; if (dir !== floatTree.root) floatTree.expanded.add(dir); floatRefresh(); editor.setStatus(`Pasted: ${name}`);
}
registerHandler("float_tree_copy", () => { if (floatShowingInfo) { editor.setClipboard(floatInfoPath); editor.setStatus("Path copied"); } else return floatFileAction("copy"); });
registerHandler("float_tree_cut", () => floatFileAction("cut"));
registerHandler("float_tree_duplicate", () => floatFileAction("duplicate"));
registerHandler("float_tree_paste", floatPaste);
registerHandler("float_tree_rename", () => floatFileAction("rename"));
registerHandler("float_tree_find_or_add", () => { if (floatAdding) return floatCreate(false); editor.unmountFloatingWidget(FLOAT_TREE_PANEL); editor.executeAction("quick_open_files"); });
function floatSortKey(key: string) {
  if (!floatSorting) return;
  const modes: Record<string,string> = {n:"name",s:"size",t:"time"};
  if (modes[key]) floatSort = modes[key];
  floatSorting = false; floatRefresh();
}
registerHandler("float_tree_sort", () => { if (floatSorting) floatSortKey("s"); else { floatSorting = true; floatAdding = false; floatCommands = false; editor.updateFloatingWidget(FLOAT_TREE_PANEL, floatTreeSpec()); } });
registerHandler("float_sort_name", () => { if (floatCommands) return floatFileAction("rename"); floatSortKey("n"); });
registerHandler("float_sort_time", () => floatSortKey("t"));
registerHandler("float_escape", () => {});
registerHandler("float_tree_back", floatBack);
registerHandler("float_tree_down", () => floatMove(1));
registerHandler("float_tree_up", () => floatMove(-1));
registerHandler("float_tree_expand", floatExpand);
registerHandler("float_tree_collapse", floatCollapse);
function floatToggle() { const item = floatTree.entries[floatTree.selected]; if (item?.dir && floatTree.expanded.has(item.path)) floatCollapse(); else floatExpand(); }
registerHandler("float_tree_toggle", floatToggle);
registerHandler("float_tree_collapse_all", () => { floatTree.expanded.clear(); floatTree.filter = ""; floatTree.selected = 0; floatRefresh(); });
registerHandler("float_tree_close", () => { if (floatShowingInfo) { floatShowingInfo = false; floatInfoSequence++; floatRefresh(); } else if (floatShowingHelp) floatHelp(); else if (floatAdding || floatSorting || floatCommands) { floatAdding = false; floatSorting = false; floatCommands = false; floatRefresh(); } else editor.unmountFloatingWidget(FLOAT_TREE_PANEL); });
registerHandler("float_tree_hidden", () => { floatTree.showHidden = !floatTree.showHidden; floatRefresh(); });
registerHandler("float_tree_filter", async () => { const value = await editor.prompt("Filter visible entries: ", floatTree.filter); if (value !== null) { floatTree.filter = value; floatTree.selected = 0; floatRefresh(); } });
registerHandler("float_tree_search", async () => { editor.unmountFloatingWidget(FLOAT_TREE_PANEL); await editor.flush(); editor.executeAction("quick_open_files"); });
editor.defineMode(FLOAT_TREE_MODE, [["i","float_tree_info"],["y","float_tree_copy"],["x","float_tree_cut"],["u","float_tree_duplicate"],["p","float_tree_paste"],["c","float_tree_commands"],["Escape","float_escape"],["n","float_sort_name"],["t","float_sort_time"],["a","float_tree_add"],["d","float_tree_add_dir"],["?","float_help"],["C-/","float_help"],["C-S-/","float_help"],["s","float_tree_sort"],["b","float_tree_back"],["j","float_tree_down"],["k","float_tree_up"],["l","float_tree_expand"],["h","float_tree_collapse"],["Enter","float_tree_toggle"],["W","float_tree_collapse_all"],["q","float_tree_close"],["z","float_tree_close"],[".","float_tree_hidden"],["/","float_tree_filter"],["f","float_tree_find_or_add"]], true, false);
registerHandler("float_tree_open", () => {
  floatShowingInfo = false; floatShowingHelp = false; floatAdding = false; floatSorting = false; floatCommands = false; floatHistory.length = 0; floatProjectRoot = editor.getCwd(); floatTree.root = floatProjectRoot; floatTree.expanded = new Set(); floatTree.filter = ""; floatTree.selected = 0;
  floatTree.showHidden = !!editor.getConfig().file_explorer?.show_hidden;
  floatTree.entries = floatBuildEntries();
  editor.mountFloatingWidget(FLOAT_TREE_PANEL, floatTreeSpec(), 85, 94, false, true, "Files", true, false, FLOAT_TREE_MODE);
  void floatLoadMetadata();
});
editor.on("widget_event", (e) => {
  if (e.panel_id !== FLOAT_TREE_PANEL || e.widget_key !== "files") return;
  if (e.event_type === "select" && typeof e.payload?.index === "number") floatTree.selected = e.payload.index;
  if (e.event_type === "activate") { if (typeof e.payload?.index === "number") floatTree.selected = e.payload.index; floatToggle(); }
});
editor.registerCommand("Explorer: Floating files", "Browse project files in a large panel", "float_tree_open");

// Python debugger prototype: one debugpy launch session in a local workspace.
const PYDBG_SIDEBAR = 38480;
const PYDBG_CONSOLE = 38481;
const PYDBG_DIR = editor.pathJoin(editor.getConfigDir(), "fresh-kit-runtime");
const FRESH_KIT_PYTHON = __FRESH_KIT_PYTHON__;
let PYDBG_SOCKET = "";
const pydbg = { file: "", buffer: 0, panel: 0, panelSplit: 0, ownsPanelSplit: false, split: 0, help: false, consoleInput: "", sidebarVisible: false, sidebarRows: 24, lastState: null as any, status: "idle", line: 0, selectedFile: "", executionLine: 0, executionFile: "", highlightBuffer: 0, highlightRevision: 0, frameBuffer: 0, frameRevision: 0, disabled: new Map<string, Set<number>>(), breakpoints: new Map<string, Set<number>>(), conditions: new Map<string, Map<number,string>>(), timer: 0, busy: false, started: false, generation: 0, output: "" };
function pydbgLines(path: string): number[] { return [...(pydbg.breakpoints.get(path) ?? new Set<number>())].sort((a,b) => a-b); }
function pydbgSpecs(path: string) { const cond=pydbg.conditions.get(path); return pydbgLines(path).filter(line=>!pydbg.disabled.get(path)?.has(line)).map(line => cond?.get(line) ? {line,condition:cond.get(line)} : {line}); }
function pydbgMarks() {
  if (!pydbg.buffer) return;
  editor.clearLineIndicators(pydbg.buffer,"python-debug-breakpoints");
  const active=pydbgLines(pydbg.file).filter(n=>!pydbg.disabled.get(pydbg.file)?.has(n));
  const disabled=pydbgLines(pydbg.file).filter(n=>pydbg.disabled.get(pydbg.file)?.has(n));
  editor.setLineIndicators(pydbg.buffer,active.map(n=>n-1),"python-debug-breakpoints","●",235,100,80,100);
  editor.setLineIndicators(pydbg.buffer,disabled.map(n=>n-1),"python-debug-breakpoints","○",130,130,130,100);
}
function pydbgClearExecution() {
  pydbg.highlightRevision++;
  if(pydbg.highlightBuffer) { editor.clearNamespace(pydbg.highlightBuffer,"python-debug-execution"); editor.clearLineIndicators(pydbg.highlightBuffer,"python-debug-current"); }
  pydbg.highlightBuffer=0;pydbg.executionLine=0;pydbg.executionFile="";
}
async function pydbgHighlightExecution(file: string, line: number) {
  if(!file || line<1) { pydbgClearExecution();return; }
  if(pydbg.executionFile===file && pydbg.executionLine===line && pydbg.highlightBuffer) return;
  pydbgClearExecution(); pydbg.executionFile=file; pydbg.executionLine=line; const revision=pydbg.highlightRevision;
  let id=editor.findBufferByPath(file);
  if(!id) { await editor.flush(); id=editor.findBufferByPath(file); }
  if(!id) return;
  pydbg.highlightBuffer=id;
  editor.setLineIndicator(id,line-1,"python-debug-current","▶",240,200,80,110);
  try {
    const length=editor.getBufferLength(id); const text=await editor.getBufferText(id,0,Math.min(length,4*1024*1024));
    if(revision!==pydbg.highlightRevision || !pydbg.started) return;
    let start=0; for(let n=1;n<line;n++) { const next=text.indexOf("\n",start); if(next<0) return; start=next+1; }
    let end=text.indexOf("\n",start); if(end<0)end=text.length;
    const from=editor.utf8ByteLength(text.slice(0,start)); const to=from+Math.max(1,editor.utf8ByteLength(text.slice(start,end)));
    editor.addOverlay(id,"python-debug-execution",from,to,{bg:[78,72,36],extendToLineEnd:true});
  } catch (_) { /* The gutter arrow still shows the stopped line. */ }
}
function pydbgClearFrame() {
  pydbg.frameRevision++;
  if(pydbg.frameBuffer) { editor.clearNamespace(pydbg.frameBuffer,"python-debug-frame"); editor.clearLineIndicators(pydbg.frameBuffer,"python-debug-frame"); }
  pydbg.frameBuffer=0;
}
async function pydbgHighlightFrame(file: string, line: number, executionFile: string, executionLine: number) {
  pydbgClearFrame();
  if(!file || line < 1 || (file===executionFile && line===executionLine)) return;
  const revision=pydbg.frameRevision;
  await editor.flush(); const id=editor.findBufferByPath(file); if(!id || revision!==pydbg.frameRevision) return;
  pydbg.frameBuffer=id;
  editor.setLineIndicator(id,line-1,"python-debug-frame","◆",115,170,200,105);
  try {
    const length=editor.getBufferLength(id); const text=await editor.getBufferText(id,0,Math.min(length,4*1024*1024));
    if(revision!==pydbg.frameRevision || !pydbg.started) return;
    let start=0; for(let n=1;n<line;n++) { const next=text.indexOf("\n",start); if(next<0) return; start=next+1; }
    let end=text.indexOf("\n",start); if(end<0)end=text.length;
    const from=editor.utf8ByteLength(text.slice(0,start)); const to=from+Math.max(1,editor.utf8ByteLength(text.slice(start,end)));
    editor.addOverlay(id,"python-debug-frame",from,to,{bg:[39,65,83],extendToLineEnd:true});
  } catch (_) { /* The gutter diamond remains visible. */ }
}
function pydbgCloseUI() {
  pydbgClearFrame(); pydbgClearExecution();
  if(pydbg.sidebarVisible) editor.unmountFloatingWidget(PYDBG_SIDEBAR);
  pydbg.sidebarVisible=false;
  if(pydbg.panel) {
    editor.unmountWidgetPanel(PYDBG_CONSOLE);
    const pane=editor.listSplits().find(p=>p.splitId===pydbg.panelSplit);
    if(pydbg.ownsPanelSplit && pane?.bufferId===pydbg.panel) editor.closeSplit(pydbg.panelSplit);
    editor.closeBuffer(pydbg.panel,true);
  }
  pydbg.panel=0;pydbg.panelSplit=0;pydbg.ownsPanelSplit=false;pydbg.lastState=null;pydbg.help=false;
}

async function pydbgCall(data: Record<string,unknown>): Promise<any> {
  const result = await editor.spawnProcess(FRESH_KIT_PYTHON,[`${PYDBG_DIR}/bridge.py`,"call",PYDBG_SOCKET,JSON.stringify(data)]);
  if (result.exit_code !== 0) throw new Error(result.stderr || "Debug bridge failed");
  const value=JSON.parse(result.stdout); if (!value.ok) throw new Error(value.error ?? "Debug request failed"); return value;
}
async function pydbgBreakpoint() {
  const id=editor.getActiveBufferId(), file=editor.getBufferPath(id), line=editor.getPrimaryCursor()?.line;
  if (!file.endsWith(".py") || line === null || line === undefined) { editor.setStatus("Open a Python file to toggle a breakpoint"); return; }
  const lines=pydbg.breakpoints.get(file) ?? new Set<number>(); const n=line+1; if(lines.has(n)) { lines.delete(n); pydbg.conditions.get(file)?.delete(n); pydbg.disabled.get(file)?.delete(n); } else lines.add(n); pydbg.breakpoints.set(file,lines);
  editor.clearLineIndicators(id,"python-debug-breakpoints");editor.setLineIndicators(id,pydbgLines(file).map(x=>x-1),"python-debug-breakpoints","●",235,100,80,100);
  if(pydbg.started && file===pydbg.file && !["idle","finished","error"].includes(pydbg.status)) { try { await pydbgCall({op:"breakpoints",file,breakpoints:pydbgSpecs(file)}); } catch(e) {editor.setStatus(`Breakpoint error: ${String(e)}`);} }
  editor.setStatus(`Breakpoint ${lines.has(n)?"set":"removed"} at line ${n}`);
}
function pydbgSidebarSpec(state: any) {
  const frames=(state.frames ?? []).map((f:any)=>({text:`${f.name}  ${(f.path ?? "").split(/[\\/]/).pop()}:${f.line ?? "?"}`,properties:{}}));
  const locals=(state.variables ?? []).map((v:any)=>({text:`${v.name} = ${v.value}`,properties:{}}));
  const allBreakpoints=[...pydbg.breakpoints.entries()].flatMap(([path,lines])=>[...lines].sort((a,b)=>a-b).map(line=>({path,line})));
  const breakpoints=allBreakpoints.map(b=>({text:`[${pydbg.disabled.get(b.path)?.has(b.line) ? " " : "x"}] ${b.path.split(/[\\/]/).pop()}:${b.line}`,properties:{}}));
  const globals=(state.globals ?? []).map((v:any)=>({text:`${v.name} = ${v.value}`,properties:{}}));
  return {kind:"col", children:[
    {kind:"label",text:`CALL STACK · ${state.status.toUpperCase()}`,labelWidth:0,wrap:false,elide:"tail"},
    {kind:"list",key:"stack",items:frames,itemKeys:frames.map((_:any,i:number)=>`frame-${i}`),selectedIndex:state.selected_frame ?? 0,visibleRows:3,focusable:true,typeAhead:false},
    {kind:"spacer",cols:1,flex:false},
    {kind:"divider",ch:"─"},
    {kind:"spacer",cols:1,flex:false},
    {kind:"label",text:"LOCALS",labelWidth:0,wrap:false,elide:"tail"},
    {kind:"list",key:"locals",items:locals,itemKeys:locals.map((_:any,i:number)=>`local-${i}`),selectedIndex:0,visibleRows:4,focusable:true,typeAhead:false},
    {kind:"divider",ch:"─"},
    {kind:"label",text:"GLOBALS",labelWidth:0,wrap:false,elide:"tail"},
    {kind:"list",key:"globals",items:globals,itemKeys:globals.map((_:any,i:number)=>`global-${i}`),selectedIndex:0,visibleRows:2,focusable:true,typeAhead:false},
    {kind:"divider",ch:"─"},
    {kind:"label",text:"BREAKPOINTS · Enter toggle",labelWidth:0,wrap:false,elide:"tail"},
    {kind:"list",key:"breakpoints",items:breakpoints,itemKeys:breakpoints.map((_:any,i:number)=>`breakpoint-${i}`),selectedIndex:0,visibleRows:3,focusable:true,typeAhead:false},
  ]};
}
function pydbgConsoleSpec(state: any) {
  const output=String(state.output ?? "").split("\n");
  const lines=output.length && output[output.length-1]==="" ? output.slice(0,-1) : output;
  const rows=lines.map(text=>({text,properties:{}}));
  return {kind:"col",children:[
    {kind:"label",text:`PYTHON DEBUG · ${state.status.toUpperCase()}`,labelWidth:0,wrap:false,elide:"tail"},
    {kind:"list",key:"output",items:rows,itemKeys:rows.map((_,i)=>`out-${i}`),selectedIndex:Math.max(0,rows.length-1),focusable:true,typeAhead:false},
    {kind:"text",key:"console",label:">>>",value:pydbg.consoleInput,placeholder:"Python expression or print(...) ",labelWidth:4,fullWidth:true,cursorByte:-1,focused:true,rows:1,minRows:0,maxRows:0,fieldWidth:0,maxVisibleChars:0,completions:[],blockCaret:false,selStart:-1,selEnd:-1,readOnly:false,markdown:false,combo:false},
  ]};
}
function pydbgRender(state: any) {
  if (!pydbg.panel) return;
  pydbg.lastState=state;
  if(pydbg.sidebarVisible) editor.updateFloatingWidget(PYDBG_SIDEBAR,pydbgSidebarSpec(state));
  if (pydbg.help) {
    const text=" PYTHON DEBUG · SHORTCUTS\n\n Enter             Evaluate console input\n ↑ / ↓             Select call stack frame in sidebar\n ?                 Toggle this help\n Ctrl+D, Ctrl+P    Start\n Ctrl+D, Ctrl+R    Restart\n Ctrl+D, Ctrl+G    Continue\n Ctrl+D, Ctrl+N    Step over\n Ctrl+D, Ctrl+I    Step into\n Ctrl+D, Ctrl+Q    Stop\n Ctrl+D, Ctrl+B    Focus sidebar\n Ctrl+D, Ctrl+D    Toggle breakpoint (editor)\n Ctrl+D, Ctrl+C    Conditional breakpoint (editor)\n";
    editor.updateWidgetPanel(PYDBG_CONSOLE,{kind:"label",text,labelWidth:0,wrap:false,elide:"tail"}); return;
  }
  editor.updateWidgetPanel(PYDBG_CONSOLE,pydbgConsoleSpec(state));
  const outputLines=String(state.output ?? "").split("\n").filter((_:string,i:number,a:string[]) => i<a.length-1 || a[i]!=="");
  editor.widgetMutate(PYDBG_CONSOLE,{kind:"setSelectedIndex",widgetKey:"output",index:Math.max(0,outputLines.length-1)});
}
async function pydbgSelectFrameIndex(index: number) {
  if (!pydbg.started || pydbg.status !== "stopped") { editor.setStatus("Pause the debugger first"); return; }
  try {
    const current=await pydbgCall({op:"status"}); const n=(current.frames ?? []).length;
    if(!n) { editor.setStatus("Call stack is not available yet");return; }
    index=Math.max(0,Math.min(n-1,index));
    const state=await pydbgCall({op:"frame",index}); pydbg.line=state.line ?? 0; pydbg.selectedFile=state.file ?? "";
    if(state.file && state.line) { editor.openFileInSplit(pydbg.split,state.file,state.line,1); editor.floatingPanelControl(PYDBG_SIDEBAR,"focus",0); void pydbgHighlightFrame(state.file,state.line,state.execution_file,state.execution_line); } else pydbgClearFrame();
    pydbgRender(state);
  } catch(e) { editor.setStatus(`Python debug: ${String(e)}`); }
}

async function pydbgSelectFrame(delta: number) {
  const current=await pydbgCall({op:"status"}); await pydbgSelectFrameIndex((current.selected_frame ?? 0)+delta);
}
async function pydbgRunExpression(expression: string) {
  if (!pydbg.started || pydbg.status !== "stopped") { editor.setStatus("Pause the debugger first"); return; }
  if(!expression.trim()) return;
  try { const state=await pydbgCall({op:"evaluate",expression}); pydbgRender(state); }
  catch(e) { editor.setStatus(`Python evaluation failed: ${String(e)}`); }
}
async function pydbgEvaluate() {
  if (!pydbg.started || pydbg.status !== "stopped") { editor.setStatus("Pause the debugger first"); return; }
  const expression=await editor.prompt("Python (selected frame): ", "");
  if(expression!==null) await pydbgRunExpression(expression);
}
async function pydbgSubmit() {
  const expression=pydbg.consoleInput; if(!expression.trim()) return;
  pydbg.consoleInput=""; editor.widgetMutate(PYDBG_CONSOLE,{kind:"setValue",widgetKey:"console",value:"",cursorByte:0});
  await pydbgRunExpression(expression);
}
async function pydbgToggleListedBreakpoint(index: number) {
  const all=[...pydbg.breakpoints.entries()].flatMap(([path,lines])=>[...lines].sort((a,b)=>a-b).map(line=>({path,line})));
  const selected=all[index]; if(!selected)return;
  const disabled=pydbg.disabled.get(selected.path) ?? new Set<number>();
  if(disabled.has(selected.line)) disabled.delete(selected.line); else disabled.add(selected.line);
  pydbg.disabled.set(selected.path,disabled); pydbgMarks();
  if(pydbg.started && selected.path===pydbg.file && !["idle","finished","error"].includes(pydbg.status)) {
    try { await pydbgCall({op:"breakpoints",file:selected.path,breakpoints:pydbgSpecs(selected.path)}); }
    catch(e) { if(disabled.has(selected.line)) disabled.delete(selected.line);else disabled.add(selected.line);pydbgMarks();editor.setStatus(`Breakpoint update failed: ${String(e)}`); }
  }
  if(pydbg.lastState) pydbgRender(pydbg.lastState);
}
editor.on("widget_event", (event) => {
  if (event.panel_id===PYDBG_CONSOLE && event.widget_key==="console" && event.event_type==="change") pydbg.consoleInput=String(event.payload?.value ?? "");
  if (event.panel_id===PYDBG_SIDEBAR && event.widget_key==="stack" && event.event_type==="select" && typeof event.payload?.index==="number" && event.payload.index !== pydbg.lastState?.selected_frame) void pydbgSelectFrameIndex(event.payload.index);
  if (event.panel_id===PYDBG_SIDEBAR && event.widget_key==="breakpoints" && event.event_type==="activate" && typeof event.payload?.index==="number") void pydbgToggleListedBreakpoint(event.payload.index);
  if (event.panel_id===PYDBG_SIDEBAR && event.event_type==="cancel") pydbg.sidebarVisible=false;
});

registerHandler("python_debug_submit",pydbgSubmit);
function pydbgResizeSidebar(delta: number) {
  if(!pydbg.sidebarVisible) { editor.setStatus("Start Python debugging first"); return; }
  pydbg.sidebarRows=Math.max(6,Math.min(editor.getScreenSize().height-5,pydbg.sidebarRows+delta));
  editor.floatingPanelControl(PYDBG_SIDEBAR,"sidebar_rows",pydbg.sidebarRows);
  if(pydbg.lastState) pydbgRender(pydbg.lastState);
  editor.setStatus(`Debug sidebar height: ${pydbg.sidebarRows} rows`);
}
registerHandler("python_debug_sidebar_taller",()=>pydbgResizeSidebar(4));
registerHandler("python_debug_sidebar_shorter",()=>pydbgResizeSidebar(-4));
editor.registerCommand("Python Debug: Taller Sidebar","Increase debug sidebar height","python_debug_sidebar_taller");
editor.registerCommand("Python Debug: Shorter Sidebar","Decrease debug sidebar height","python_debug_sidebar_shorter");
registerHandler("python_debug_sidebar",()=>{ if(pydbg.sidebarVisible) editor.floatingPanelControl(PYDBG_SIDEBAR,"focus",0); else editor.setStatus("Start Python debugging first"); });
editor.registerCommand("Python Debug: Focus Sidebar","Focus debug call stack and variables","python_debug_sidebar");
function pydbgToggleHelp() { pydbg.help=!pydbg.help; if(pydbg.lastState) pydbgRender(pydbg.lastState); if(!pydbg.help) editor.widgetMutate(PYDBG_CONSOLE,{kind:"setFocusKey",widgetKey:"console"}); }
registerHandler("python_debug_help",pydbgToggleHelp);
registerHandler("python_debug_frame_down",()=>pydbgSelectFrame(1));
registerHandler("python_debug_frame_up",()=>pydbgSelectFrame(-1));
registerHandler("python_debug_evaluate",pydbgEvaluate);
registerHandler("python_debug_focus_editor",()=>editor.focusSplit(pydbg.split));
registerHandler("python_debug_focus_panel",()=>{if(pydbg.panelSplit) { editor.focusSplit(pydbg.panelSplit); editor.widgetMutate(PYDBG_CONSOLE,{kind:"setFocusKey",widgetKey:"console"}); } else editor.setStatus("Start Python debugging first");});
editor.registerCommand("Python Debug: Focus Panel","Focus the debug console","python_debug_focus_panel");
editor.registerCommand("Python Debug: Evaluate","Evaluate Python in the selected frame","python_debug_evaluate");

async function pydbgPoll() {
  if(!pydbg.started || pydbg.busy) return; pydbg.busy=true; const generation=pydbg.generation;
  try {
    const state=await pydbgCall({op:"status"}); if(generation!==pydbg.generation) return; pydbg.status=state.status;
    if(state.status === "stopped" && state.line && state.file && (pydbg.line !== state.line || pydbg.selectedFile !== state.file)) { pydbg.line=state.line; pydbg.selectedFile=state.file; const previousSplit=editor.getActiveSplitId(); editor.openFileInSplit(pydbg.split,state.file,state.line,1); if(previousSplit !== pydbg.split) editor.focusSplit(previousSplit); await editor.flush(); }
    else if(state.status !== "stopped" && pydbg.line) { pydbg.line=0; }
    if(state.status === "stopped" && state.execution_file && state.execution_line) {
      void pydbgHighlightExecution(state.execution_file,state.execution_line);
      if(state.selected_frame===0 && pydbg.frameBuffer) pydbgClearFrame();
    } else if(state.status !== "stopped") { if(pydbg.executionLine) pydbgClearExecution(); if(pydbg.frameBuffer) pydbgClearFrame(); }
    pydbgRender(state);
    if(state.error) editor.setStatus(`Python debug: ${state.error}`);
    if(state.status === "finished") { editor.clearInterval(pydbg.timer);pydbg.timer=0; pydbg.started=false; pydbgCloseUI(); editor.setStatus("Python debug session finished"); try { await pydbgCall({op:"stop"}); } catch (_) {} }
  } catch(e) { if(generation===pydbg.generation && pydbg.started) { editor.setStatus(`Python debug: ${String(e)}`); if(pydbg.timer) editor.clearInterval(pydbg.timer);pydbg.timer=0; } }
  finally { pydbg.busy=false; }
}
registerHandler("python_debug_poll",pydbgPoll);
async function pydbgStart() {
  const id=editor.getActiveBufferId(), file=editor.getBufferPath(id);
  if(!file.endsWith(".py")) {editor.setStatus("Open a Python file first");return;}
  if(pydbg.started && !["idle","finished","error"].includes(pydbg.status)) {editor.setStatus("Python debug session already running");return;}
  if(editor.isBufferModified(id)) {
    editor.executeAction("save");
    await editor.flush();
    if(editor.isBufferModified(id)) { editor.setStatus("Save pending or failed; resolve the save prompt and retry debugging"); return; }
  }
  PYDBG_SOCKET=editor.pathJoin(editor.getTempDir(), `fresh-pydbg-${Date.now()}-${Math.floor(Math.random()*100000000)}.sock`);
  pydbg.help=false;pydbg.file=file;pydbg.buffer=id;pydbg.split=editor.getActiveSplitId();pydbg.line=0;pydbg.selectedFile="";pydbg.status="starting";
  try {
    editor.spawnBackgroundProcess(FRESH_KIT_PYTHON,[`${PYDBG_DIR}/bridge.py`,"serve",PYDBG_SOCKET]);
    let ready=false;for(let i=0;i<30;i++){await editor.delay(100);if(editor.fileExists(PYDBG_SOCKET)){ready=true;break;}}
    if(!ready) throw new Error("Debug bridge did not start");
    pydbg.started=true;
    const existingSplits=new Set(editor.listSplits().map(p=>p.splitId));
    const panel=await editor.createVirtualBufferInSplit({name:"Python Debug",mode:"python-debug-panel",readOnly:true,editingDisabled:true,entries:[{text:"Starting Python debugger…\n",properties:{}}],ratio:0.6,direction:"horizontal",panelId:"python-debug-panel",role:"utility_dock",showLineNumbers:false});
    pydbg.panel=panel.bufferId; pydbg.panelSplit=panel.splitId ?? 0; pydbg.ownsPanelSplit=!!panel.splitId && !existingSplits.has(panel.splitId);
    editor.mountWidgetPanel(PYDBG_CONSOLE,pydbg.panel,pydbgConsoleSpec({status:"starting",output:""}),{});
    editor.mountSidebarSection(PYDBG_SIDEBAR,pydbgSidebarSpec({status:"starting",frames:[],variables:[],globals:[]}),"Python Debug",pydbg.sidebarRows,{closable:true,startBlurred:true,scope:{window:editor.activeWindow()}});
    await editor.flush(); editor.floatingPanelControl(PYDBG_SIDEBAR,"reveal",0);
    editor.widgetMutate(PYDBG_CONSOLE,{kind:"setFocusKey",widgetKey:"console"});
    pydbg.sidebarVisible=true; editor.focusSplit(pydbg.split);
    const state=await pydbgCall({op:"start",file,breakpoints:pydbgSpecs(file),python:FRESH_KIT_PYTHON,debugpy_path:`${PYDBG_DIR}/deps`,cwd:editor.pathDirname(file)});
    pydbg.status=state.status;pydbgRender(state);pydbgMarks();
    pydbg.timer=editor.setInterval(700,"python_debug_poll");void pydbgPoll();
  } catch(e) {pydbg.status="error";editor.setStatus(`Python debug: ${String(e)}`);}
}
async function pydbgControl(op: string) {
  if (!pydbg.started || pydbg.status === "idle") { if(op==="continue") return pydbgStart(); editor.setStatus("Start Python debugging first"); return; }
  if(op==="stop") { pydbg.generation++; pydbg.started=false; if(pydbg.timer) editor.clearInterval(pydbg.timer); pydbg.timer=0; pydbg.line=0; pydbgCloseUI(); pydbgMarks(); editor.setStatus("Python debugger stopped"); }
  try {const state=await pydbgCall({op});pydbg.status=state.status;pydbgRender(state);if(op!=="stop") { void pydbgPoll(); }} catch(e){editor.setStatus(`Python debug: ${String(e)}`);}
}
async function pydbgConditionalBreakpoint() {
  const id=editor.getActiveBufferId(), file=editor.getBufferPath(id), line=editor.getPrimaryCursor()?.line;
  if (!file.endsWith(".py") || line === null || line === undefined) { editor.setStatus("Open a Python file first"); return; }
  const n=line+1; const conditions=pydbg.conditions.get(file) ?? new Map<number,string>();
  const expression=await editor.prompt("Breakpoint condition (empty removes): ", conditions.get(n) ?? "");
  if (expression === null) return;
  const lines=pydbg.breakpoints.get(file) ?? new Set<number>();
  if(expression.trim()) { lines.add(n); conditions.set(n,expression.trim()); } else { lines.delete(n); conditions.delete(n); }
  pydbg.breakpoints.set(file,lines); pydbg.conditions.set(file,conditions);
  editor.clearLineIndicators(id,"python-debug-breakpoints"); editor.setLineIndicators(id,pydbgLines(file).map(x=>x-1),"python-debug-breakpoints","●",235,100,80,100);
  if(pydbg.started && file===pydbg.file && !["idle","finished","error"].includes(pydbg.status)) { try { await pydbgCall({op:"breakpoints",file,breakpoints:pydbgSpecs(file)}); } catch(e) { editor.setStatus(`Breakpoint error: ${String(e)}`); return; } }
  editor.setStatus(expression.trim() ? `Conditional breakpoint set at ${n}` : `Breakpoint removed at ${n}`);
}
async function pydbgRestart() {
  if (pydbg.started) {
    pydbg.generation++; pydbg.started=false; if(pydbg.timer) editor.clearInterval(pydbg.timer); pydbg.timer=0;
    try { await pydbgCall({op:"stop"}); } catch(e) { editor.setStatus(`Could not stop debugger: ${String(e)}`); return; }
    if(pydbg.timer) editor.clearInterval(pydbg.timer); pydbg.timer=0; pydbg.started=false; pydbg.status="idle"; pydbg.line=0; pydbgCloseUI(); pydbgMarks();
    editor.focusSplit(pydbg.split); await editor.flush();
  }
  await pydbgStart();
}
registerHandler("python_debug_conditional",pydbgConditionalBreakpoint);
registerHandler("python_debug_restart",pydbgRestart);
editor.registerCommand("Python Debug: Conditional Breakpoint","Set a breakpoint condition","python_debug_conditional");
editor.registerCommand("Python Debug: Restart","Restart debugging the current file","python_debug_restart");
registerHandler("python_debug_breakpoint",pydbgBreakpoint);
registerHandler("python_debug_start",pydbgStart);
registerHandler("python_debug_continue",()=>pydbgControl("continue"));
registerHandler("python_debug_next",()=>pydbgControl("next"));
registerHandler("python_debug_step_in",()=>pydbgControl("stepIn"));
registerHandler("python_debug_step_out",()=>pydbgControl("stepOut"));
registerHandler("python_debug_stop",()=>pydbgControl("stop"));
editor.defineMode("python-debug-panel",[["Enter","python_debug_submit","on:console"],["?","python_debug_help"],["C-S-/","python_debug_help","shortcut"]],true,true,true);
editor.registerCommand("Python Debug: Toggle Breakpoint","Toggle a breakpoint on the current line","python_debug_breakpoint");
editor.registerCommand("Python Debug: Start","Start debugging the current Python file","python_debug_start");
editor.registerCommand("Python Debug: Continue","Continue or start debugging","python_debug_continue");
editor.registerCommand("Python Debug: Step Over","Run the next line","python_debug_next");
editor.registerCommand("Python Debug: Step In","Step into a function","python_debug_step_in");
editor.registerCommand("Python Debug: Step Out","Finish the current function","python_debug_step_out");
editor.registerCommand("Python Debug: Stop","Stop the debugger","python_debug_stop");

// Python Outline complements Fresh's built-in Markdown Contents sidebar.
const PY_OUTLINE = 38482;
type PythonOutlineItem = {name:string; line:number; depth:number; kind:number};
const pythonOutline = {buffer:0, path:"", split:0, mounted:false, disabled:false, revision:0, items:[] as PythonOutlineItem[], busy:false, dirty:true, change:0, lastRequest:0};
function pythonOutlineUnmount() {
  pythonOutline.revision++;
  if(pythonOutline.mounted) editor.unmountFloatingWidget(PY_OUTLINE);
  pythonOutline.mounted=false; pythonOutline.buffer=0; pythonOutline.items=[];
}
function pythonOutlinePublish(message?:string) {
  if(!pythonOutline.mounted) return;
  const items=pythonOutline.items.map(s=>({text:`${"  ".repeat(Math.min(s.depth,5))}${s.kind===5?"C":"ƒ"} ${s.name}  :${s.line+1}`,properties:{}}));
  if(!items.length) items.push({text:message ?? "No classes or functions",properties:{}});
  editor.updateFloatingWidget(PY_OUTLINE,{kind:"list",key:"symbols",items,itemKeys:items.map((_,i)=>`symbol-${i}`),selectedIndex:0,visibleRows:Math.max(3,Math.min(12,items.length)),focusable:true,typeAhead:false});
}
async function pythonOutlineRefresh() {
  if(!pythonOutline.mounted || pythonOutline.busy || !pythonOutline.dirty) return;
  const now=Date.now(); if(now-pythonOutline.lastRequest<1800) return;
  pythonOutline.lastRequest=now;pythonOutline.busy=true;const revision=pythonOutline.revision, change=pythonOutline.change, path=pythonOutline.path;
  try {
    const result:any=await editor.sendLspRequest("python","textDocument/documentSymbol",{textDocument:{uri:editor.pathToFileUri(path)}});
    if(revision!==pythonOutline.revision || !pythonOutline.mounted) return;
    const items:PythonOutlineItem[]=[];
    function collect(symbols:any[],depth:number) { for(const s of symbols) {
      const range=s.selectionRange ?? s.location?.range ?? s.range;
      const show=[5,6,9,12].includes(s.kind);
      if(show && range?.start && typeof range.start.line==="number") items.push({name:String(s.name),line:range.start.line,depth:depth || (s.containerName?1:0),kind:s.kind});
      if(Array.isArray(s.children)) collect(s.children,depth+(show?1:0));
    }}
    collect(Array.isArray(result)?result:[],0);
    pythonOutline.items=items;pythonOutline.dirty=pythonOutline.change!==change;pythonOutlinePublish();
  } catch (_) { if(revision===pythonOutline.revision) pythonOutlinePublish("Waiting for Python language server…"); }
  finally { pythonOutline.busy=false; }
}
function pythonOutlineTrack(id:number) {
  const info=editor.getBufferInfo(id);
  if(!info || !info.path.toLowerCase().endsWith(".py") || pythonOutline.disabled) { pythonOutlineUnmount();return; }
  if(pythonOutline.buffer===id && pythonOutline.mounted) return;
  pythonOutlineUnmount();pythonOutline.buffer=id;pythonOutline.path=info.path;pythonOutline.split=editor.getActiveSplitId();pythonOutline.dirty=true;pythonOutline.lastRequest=0;
  editor.mountSidebarSection(PY_OUTLINE,{kind:"label",text:"Loading symbols…",labelWidth:0,wrap:false,elide:"tail"},"Outline",12,{closable:true,startBlurred:true,scope:{buffer:id}});
  pythonOutline.mounted=true;editor.floatingPanelControl(PY_OUTLINE,"reveal",0);void pythonOutlineRefresh();
}
registerHandler("python_outline_tick",()=>{void pythonOutlineRefresh();});
editor.setInterval(2000,"python_outline_tick");
editor.on("buffer_activated",e=>pythonOutlineTrack(e.buffer_id));
editor.on("after_file_open",e=>{if(editor.getActiveBufferId()===e.buffer_id) pythonOutlineTrack(e.buffer_id);});
editor.on("buffer_modified",e=>{if(e.buffer_id===pythonOutline.buffer) {pythonOutline.change++;pythonOutline.dirty=true;}});
editor.on("after_file_save",e=>{if(e.buffer_id===pythonOutline.buffer) {pythonOutline.dirty=true;void pythonOutlineRefresh();}});
editor.on("buffer_closed",e=>{if(e.buffer_id===pythonOutline.buffer) pythonOutlineUnmount();});
editor.on("widget_event",e=>{
  if(e.panel_id!==PY_OUTLINE) return;
  if(e.event_type==="cancel") {pythonOutline.disabled=true;pythonOutlineUnmount();return;}
  if(e.widget_key==="symbols" && e.event_type==="activate" && typeof e.payload?.index==="number") {
    const item=pythonOutline.items[e.payload.index];if(!item)return;
    editor.openFileInSplit(pythonOutline.split,pythonOutline.path,item.line+1,1);editor.focusSplit(pythonOutline.split);
  }
});
registerHandler("python_outline_toggle",()=>{if(pythonOutline.mounted){pythonOutline.disabled=true;pythonOutlineUnmount();}else{pythonOutline.disabled=false;pythonOutlineTrack(editor.getActiveBufferId());}});
editor.registerCommand("Python: Toggle Outline","Show or hide Python symbols in the sidebar","python_outline_toggle");
registerHandler("python_outline_focus",()=>{if(pythonOutline.mounted) editor.floatingPanelControl(PY_OUTLINE,"focus",0); else editor.setStatus("Open a Python file and enable Outline first");});
editor.registerCommand("Python: Focus Outline","Focus Python symbols in the sidebar","python_outline_focus");
registerHandler("python_outline_init",()=>pythonOutlineTrack(editor.getActiveBufferId()));
editor.setTimeout(1200,"python_outline_init");

// Open another project without closing the current workspace.
async function openFolderAt(value: string) {
  if(!value.trim()) return;
  try {
    const program="import os,sys,json\np=os.path.realpath(os.path.join(sys.argv[1],os.path.expanduser(sys.argv[2])))\nprint(json.dumps({'path':p,'directory':os.path.isdir(p)}))";
    const result=await editor.spawnProcess(FRESH_KIT_PYTHON,["-c",program,editor.getCwd(),value.trim()]);
    if(result.exit_code!==0) throw new Error(result.stderr.trim() || "Could not resolve folder");
    const folder=JSON.parse(result.stdout);
    if(!folder.directory) {editor.setStatus("Folder does not exist or is not a directory");return;}
    const key=(path:string)=>{const normalized=path.replace(/\\/g,"/").replace(/^\/\/\?\//,"").replace(/\/+$/,"");return editor.getEnv("OS")==="Windows_NT" ? normalized.toLowerCase() : normalized;};
    await editor.loadWorkspaces();
    let target=editor.listWindows().find(w=>key(w.root)===key(folder.path));
    let created=false;
    if(!target) {
      created=true;
      if(!editor.createWindow(folder.path,"")) throw new Error("Could not create workspace");
      await editor.flush();
      target=editor.listWindows().find(w=>key(w.root)===key(folder.path));
    }
    if(!target) throw new Error("Workspace could not be found after creation");
    editor.setActiveWindow(target.id);
    if(created) {await editor.flush();editor.executeAction("focus_file_explorer");}
  } catch(e) {editor.setStatus(`Open Folder: ${String(e)}`);}
}
function folderSuggestions(input:string) {
  const normalized=input.replace(/\\/g,"/");
  const slash=normalized.lastIndexOf("/");
  const base=slash<0 ? "" : normalized.slice(0,slash+1);
  const pattern=slash<0 ? normalized : normalized.slice(slash+1);
  let lookup=base || editor.getCwd();
  if(lookup==="~/") lookup=editor.getHomeDir();
  else if(lookup.startsWith("~/")) lookup=editor.pathJoin(editor.getHomeDir(),lookup.slice(2));
  else if(!editor.pathIsAbsolute(lookup)) lookup=editor.pathJoin(editor.getCwd(),lookup);
  const exact=input.startsWith("~/") ? editor.pathJoin(editor.getHomeDir(),input.slice(2)) : editor.pathIsAbsolute(input) ? input : editor.pathJoin(editor.getCwd(),input);
  const stat=editor.fileStat(exact) as {isDir?:boolean}|null;
  const rows: {id:string;text:string;value:string;description?:string}[]=[];
  if(stat?.isDir) rows.push({id:"current:"+input,text:"Open this folder",value:input,description:input});
  for(const entry of editor.readDir(lookup).filter(e=>e.is_dir && (pattern.startsWith(".") || !e.name.startsWith(".")) && e.name.toLowerCase().startsWith(pattern.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,100)) {
    const path=base+entry.name+"/";rows.push({id:path,text:entry.name+"/",value:path,description:"Folder"});
  }
  editor.setPromptSuggestions(rows,0);
}
registerHandler("user_open_folder",()=>{const initial=editor.getCwd().replace(/\\/g,"/").replace(/\/+$/,"")+"/";editor.startPromptWithInitial("Open folder: ","user-open-folder",initial);folderSuggestions(initial);});
editor.on("prompt_changed",e=>{if(e.prompt_type==="user-open-folder") folderSuggestions(e.input);});
editor.on("prompt_confirmed",e=>{if(e.prompt_type==="user-open-folder") void openFolderAt(e.input);});
editor.registerCommand("Open Folder","Open a directory in a workspace","user_open_folder");

// A compact, read-only shortcut reference for Fresh's built-in Review Diff.
const REVIEW_KEYS_PANEL=38483;
const REVIEW_KEYS_MODE="review-keys-popup";
const REVIEW_KEYS_LINES=[
  "  NAVIGATION",
  "  j / k        Move                  n / p     Next / previous change",
  "  , / .        Previous / next file  Tab       Switch focus",
  "  Enter        Open side-by-side     Alt+O     Open working file",
  "",
  "  DISPLAY",
  "  1 / 2 / 0    Unified / split / auto",
  "  F / C        Toggle files / comments     /    Filter files",
  "  z a / z r    Collapse / expand all     W    Toggle auto-refresh",
  "",
  "  CHANGES",
  "  s / u / d    Stage / unstage / discard selected change",
  "  S / U / D    Stage / unstage / discard whole file",
  "  v            Select lines          c / x     Add / delete comment",
  "",
  "  r            Refresh               q         Close review",
  "",
  "  ?  Close shortcuts"
];
function reviewKeysClose() {editor.unmountFloatingWidget(REVIEW_KEYS_PANEL);}
registerHandler("user_review_keys_close",reviewKeysClose);
editor.defineMode(REVIEW_KEYS_MODE,[["?","user_review_keys_close"],["q","user_review_keys_close"],["Escape","user_review_keys_close"]],true,false);
registerHandler("user_review_keys",()=>{
  editor.mountFloatingWidget(REVIEW_KEYS_PANEL,{kind:"col",children:REVIEW_KEYS_LINES.map(text=>({kind:"label",text,labelWidth:0,wrap:false,elide:"tail"}))},65,65,false,true,"Review Keys",true,false,REVIEW_KEYS_MODE);
});
editor.registerCommand("Review Diff: Keys","Show Review Diff shortcuts","user_review_keys");

// Open a terminal in the native utility dock with a stable shell-only label.
async function userOpenTerminal() {
  const before=new Set(editor.listBuffers().map(b=>b.id));
  editor.executeAction("open_terminal_in_dock");
  await editor.flush();
  const temp=editor.getActiveBufferId();
  if(before.has(temp) || !editor.getBufferInfo(temp)?.is_terminal) {editor.setStatus("Could not create terminal dock");return;}
  try {
    const shellConfig=editor.getConfig().terminal?.shell as any;
    const executable=(typeof shellConfig==="string" ? shellConfig : shellConfig?.program ?? shellConfig?.command) || editor.getEnv("SHELL") || editor.getEnv("COMSPEC") || "Terminal";
    const title=String(executable).split(/[\\/]/).pop()?.replace(/\.exe$/i,"") || "Terminal";
    await editor.createTerminal({title:`${title} `,persistent:true});
    editor.closeBuffer(temp,true);
  } catch(e) {editor.setStatus(`Terminal: ${String(e)}`);}
}
registerHandler("user_open_terminal",userOpenTerminal);
editor.registerCommand("Open Terminal","Open a shell in the utility dock","user_open_terminal");

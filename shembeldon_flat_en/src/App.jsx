
import React, { useEffect, useMemo, useState } from "react";
import seed from "./seed.json";

const STORAGE_KEY = "shembeldon_en_v1";

function loadInitial() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { players: seed.players ?? [], fixtures: seed.fixtures ?? [], matches: seed.matches ?? [] };
}

function saveData(data) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function LeagueApp() {
  const initial = loadInitial();
  const [players, setPlayers] = useState(initial?.players ?? []);
  const [fixtures, setFixtures] = useState(initial?.fixtures ?? []);
  const [matches, setMatches] = useState(initial?.matches ?? []);
  const [activeTab, setActiveTab] = useState("schedule");

  useEffect(() => { saveData({ players, fixtures, matches }); }, [players, fixtures, matches]);

  function addPlayer(name) {
    const n = (name || "").trim();
    if (!n) return;
    if (players.includes(n)) return alert("This player already exists");
    setPlayers([...players, n]);
  }
  function removePlayer(name) {
    if (!confirm(`Remove ${name}?`)) return;
    setPlayers(players.filter((p) => p !== name));
    setMatches(matches.filter((m) => m.a !== name && m.b !== name));
    setFixtures(fixtures.filter((f) => f.a !== name && f.b !== name));
  }

  function parseSets(setsText) {
    const parts = (setsText || "").split(/[,\\n]/).map((s) => s.trim()).filter(Boolean);
    const sets = []; let wa = 0, wb = 0;
    for (const part of parts) {
      const m = part.match(/^(\\d{1,2})\\s*[-x:]\\s*(\\d{1,2})$/);
      if (!m) throw new Error(`Invalid set format: "${part}"`);
      const ga = parseInt(m[1], 10); const gb = parseInt(m[2], 10);
      sets.push({ ga, gb });
      if (ga > gb) wa++; else if (gb > ga) wb++;
      if (wa === 2 || wb === 2) break;
    }
    if (sets.length < 2) throw new Error("At least 2 sets are required (Best-of-3)");
    return sets;
  }
  function computeWinner(sets) {
    let wa = 0, wb = 0;
    for (const s of sets) { if (s.ga > s.gb) wa++; else if (s.gb > s.ga) wb++; }
    if (wa === wb) {
      let gA = 0, gB = 0; for (const s of sets) { gA += s.ga; gB += s.gb; }
      if (gA === gB) return null; return gA > gB ? "A" : "B";
    }
    return wa > wb ? "A" : "B";
  }
  function addMatch({ date, a, b, setsText, notes }) {
    if (a === b) return alert("Select different players");
    let sets; try { sets = parseSets(setsText); } catch (e) { return alert(e.message); }
    const winner = computeWinner(sets);
    const id = crypto.randomUUID();
    setMatches([{ id, date, a, b, sets, notes: (notes || "").trim(), winner }, ...matches]);
  }
  function deleteMatch(id) {
    if (!confirm("Delete match?")) return;
    setMatches(matches.filter((m) => m.id !== id));
  }
  const standings = useMemo(() => buildStandings(players, matches), [players, matches]);

  return (
    <div className="min-h-screen bg-black text-neutral-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col gap-2 mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            <span className="text-fuchsia-400" style={{textShadow:'0 0 8px rgba(244,114,182,0.6)'}}>Shembeldon</span>{" "}
            <span className="text-cyan-300" style={{textShadow:'0 0 8px rgba(103,232,249,0.6)'}}>Singles</span>{" "}
            <span className="text-lime-300" style={{textShadow:'0 0 8px rgba(190,242,100,0.6)'}}>Championship</span>
          </h1>
          <p className="text-sm text-neutral-400">Results · Standings · Schedule</p>
          <div className="mt-2 flex gap-2 flex-wrap">
            <TabButton active={activeTab === "schedule"} onClick={() => setActiveTab("schedule")}>Schedule</TabButton>
            <TabButton active={activeTab === "submit"} onClick={() => setActiveTab("submit")}>Submit Result</TabButton>
            <TabButton active={activeTab === "standings"} onClick={() => setActiveTab("standings")}>Standings</TabButton>
            <TabButton active={activeTab === "data"} onClick={() => setActiveTab("data")}>Data</TabButton>
          </div>
        </header>

        {activeTab === "schedule" && (<ScheduleTab fixtures={fixtures} matches={matches} />)}
        {activeTab === "submit" && (<SubmitTab players={players} fixtures={fixtures} onAddPlayer={addPlayer} onRemovePlayer={removePlayer} onAddMatch={addMatch} matches={matches} onDeleteMatch={deleteMatch} />)}
        {activeTab === "standings" && (<StandingsTab standings={standings} />)}
        {activeTab === "data" && (<DataTab players={players} fixtures={fixtures} matches={matches} setAll={(p,f,m)=>{setPlayers(p);setFixtures(f);setMatches(m);}} />)}

        <footer className="mt-10 text-xs text-neutral-500"><p>Neon prototype. Publish to GitHub Pages? I can set it up.</p></footer>
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-2xl text-sm border transition ${active ? "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500" : "bg-neutral-900 border-neutral-700 hover:bg-neutral-800"}`}>
      {children}
    </button>
  );
}

function samePairDate(m, f) {
  const samePair = (m.a === f.a && m.b === f.b) || (m.a === f.b && m.b === f.a);
  if (!samePair) return false;
  if (f.date && m.date) return f.date === m.date;
  if (!f.date && f.week && m.date) return true;
  return !f.date;
}

function SubmitTab({ players, fixtures, onAddPlayer, onRemovePlayer, onAddMatch, matches, onDeleteMatch }) {
  const [newPlayer, setNewPlayer] = useState("");
  const [useFixture, setUseFixture] = useState(true);
  const [fixtureId, setFixtureId] = useState("");
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), a: players[0] ?? "", b: players[1] ?? "", setsText: "6-4, 6-4", notes: "" });
  const unplayed = fixtures.filter((f) => !matches.some((m) => samePairDate(m, f)));

  useEffect(() => { setForm((f) => ({ ...f, a: players[0] ?? "", b: players[1] ?? "" })); }, [players.length]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4">
        <h2 className="font-semibold text-lime-200 mb-3">Players</h2>
        <div className="flex gap-2 mb-3">
          <input className="flex-1 border border-neutral-700 bg-black text-neutral-100 rounded-xl px-3 py-2" placeholder="Player name" value={newPlayer} onChange={(e)=>setNewPlayer(e.target.value)} />
          <button className="px-3 py-2 rounded-xl bg-cyan-600/30 text-cyan-200 border border-cyan-500" onClick={()=>{onAddPlayer(newPlayer); setNewPlayer("");}}>Add</button>
        </div>
        <ul className="space-y-1 max-h-64 overflow-auto pr-1">
          {players.map((p)=>(
            <li key={p} className="flex items-center justify-between gap-2 border border-neutral-700 rounded-xl px-3 py-1.5">
              <span>{p}</span>
              <button className="text-xs text-red-400" onClick={()=>onRemovePlayer(p)}>Remove</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4">
        <h2 className="font-semibold text-cyan-200 mb-3">Submit result (Best-of-3)</h2>
        <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" className="accent-fuchsia-500" checked={useFixture} onChange={(e)=>setUseFixture(e.target.checked)} />Use scheduled match</label>
        {useFixture && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs text-neutral-400">Select pending match</label>
              <select className="w-full border border-neutral-700 bg-black rounded-xl px-3 py-2" value={fixtureId} onChange={(e)=>{const id=e.target.value; setFixtureId(id); const fx=unplayed[parseInt(id,10)]; if (fx) setForm((f)=>({...f,a:fx.a,b:fx.b,date:fx.date??new Date().toISOString().slice(0,10)}));}}>
                <option value="">—</option>
                {unplayed.map((f, idx)=>(<option key={idx} value={String(idx)}>{(f.date || f.week || "") + " – " + f.a + " vs " + f.b}</option>))}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="col-span-2"><label className="text-xs text-neutral-400">Date</label><input type="date" className="w-full border border-neutral-700 bg-black rounded-xl px-3 py-2" value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})} /></div>
          <div><label className="text-xs text-neutral-400">Player A</label><select className="w-full border border-neutral-700 bg-black rounded-xl px-3 py-2" value={form.a} onChange={(e)=>setForm({...form,a:e.target.value})}>{players.map((p)=><option key={p}>{p}</option>)}</select></div>
          <div><label className="text-xs text-neutral-400">Player B</label><select className="w-full border border-neutral-700 bg-black rounded-xl px-3 py-2" value={form.b} onChange={(e)=>setForm({...form,b:e.target.value})}>{players.map((p)=><option key={p}>{p}</option>)}</select></div>
          <div className="col-span-2"><label className="text-xs text-neutral-400">Sets (e.g., 6-4, 3-6, 10-7)</label><input className="w-full border border-neutral-700 bg-black rounded-xl px-3 py-2" value={form.setsText} onChange={(e)=>setForm({...form,setsText:e.target.value})} /></div>
          <div className="col-span-2"><label className="text-xs text-neutral-400">Notes</label><input className="w-full border border-neutral-700 bg-black rounded-xl px-3 py-2" placeholder="Optional" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} /></div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-xl bg-fuchsia-600/30 text-fuchsia-200 border border-fuchsia-500" onClick={()=>{addMatch(form); setForm((f)=>({...f,setsText:"6-4, 6-4",notes:""}));}}>Save match</button>
          <button className="px-4 py-2 rounded-xl border border-neutral-700" onClick={()=>setForm({ date:new Date().toISOString().slice(0,10), a:players[0]??"", b:players[1]??"", setsText:"6-4, 6-4", notes:"" })}>Clear</button>
        </div>
      </div>

      <div className="md:col-span-2 bg-neutral-900 rounded-2xl border border-neutral-800 p-4">
        <h2 className="font-semibold text-fuchsia-200 mb-3">Recent matches</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left border-b border-neutral-800"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">A</th><th className="py-2 pr-3">B</th><th className="py-2 pr-3">Score</th><th className="py-2 pr-3">Winner</th><th className="py-2 pr-3">Notes</th><th className="py-2 pr-3"></th></tr></thead>
            <tbody>
              {matches.map((m)=>(
                <tr key={m.id} className="border-b border-neutral-800">
                  <td className="py-2 pr-3 whitespace-nowrap">{m.date}</td>
                  <td className="py-2 pr-3">{m.a}</td>
                  <td className="py-2 pr-3">{m.b}</td>
                  <td className="py-2 pr-3">{m.sets.map((s)=>`${s.ga}-${s.gb}`).join(", ")}</td>
                  <td className="py-2 pr-3">{m.winner === "A" ? m.a : m.winner === "B" ? m.b : "—"}</td>
                  <td className="py-2 pr-3">{m.notes}</td>
                  <td className="py-2 pr-3 text-right"><button className="text-xs text-red-400" onClick={()=>onDeleteMatch(m.id)}>Delete</button></td>
                </tr>
              ))}
              {matches.length === 0 && (<tr><td colSpan={7} className="py-6 text-center text-neutral-500">No matches yet</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StandingsTab({ standings }) {
  return (
    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4">
      <h2 className="font-semibold text-lime-200 mb-3">Standings</h2>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left border-b border-neutral-800"><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Player</th><th className="py-2 pr-3">MP</th><th className="py-2 pr-3">W</th><th className="py-2 pr-3">L</th><th className="py-2 pr-3">Sets</th><th className="py-2 pr-3">Games</th><th className="py-2 pr-3">Win%</th></tr></thead>
          <tbody>
            {standings.map((r,i)=>(
              <tr key={r.player} className="border-b border-neutral-800">
                <td className="py-2 pr-3">{i+1}</td>
                <td className="py-2 pr-3 font-medium">{r.player}</td>
                <td className="py-2 pr-3">{r.played}</td>
                <td className="py-2 pr-3">{r.wins}</td>
                <td className="py-2 pr-3">{r.losses}</td>
                <td className="py-2 pr-3">{r.setsWon}-{r.setsLost} ({diff(r.setsWon, r.setsLost)})</td>
                <td className="py-2 pr-3">{r.gamesWon}-{r.gamesLost} ({diff(r.gamesWon, r.gamesLost)})</td>
                <td className="py-2 pr-3">{(r.wins / Math.max(1, r.played) * 100).toFixed(0)}%</td>
              </tr>
            ))}
            {standings.length === 0 && (<tr><td colSpan={8} className="py-6 text-center text-neutral-500">Add players to see the table</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleTab({ fixtures, matches }) {
  const byWeek = useMemo(() => groupByWeek(fixtures), [fixtures]);
  return (
    <div className="space-y-4">
      {Object.keys(byWeek).length === 0 && (<div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 text-neutral-400">No scheduled matches</div>)}
      {Object.entries(byWeek).sort(([a],[b])=>a.localeCompare(b)).map(([wk, list]) => (
        <div key={wk} className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4">
          <h3 className="font-semibold text-fuchsia-200 mb-3">Week {wk}</h3>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="text-left border-b border-neutral-800"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Match</th><th className="py-2 pr-3">Status</th></tr></thead>
              <tbody>
                {list.map((f, idx) => {
                  const played = matches.some((m)=>samePairDate(m,f));
                  return (<tr key={idx} className="border-b border-neutral-800"><td className="py-2 pr-3 whitespace-nowrap">{f.date || ""}</td><td className="py-2 pr-3">{f.a} vs {f.b}</td><td className="py-2 pr-3">{played ? "Played" : "Pending"}</td></tr>);
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function DataTab({ players, fixtures, matches, setAll }) {
  const [raw, setRaw] = useState(() => JSON.stringify({ players, fixtures, matches }, null, 2));
  return (
    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4">
      <h2 className="font-semibold text-cyan-200 mb-3">Export / Import</h2>
      <p className="text-sm text-neutral-400 mb-3">Copy this JSON to back up your league or paste to import.</p>
      <textarea className="w-full h-64 border border-neutral-700 bg-black text-neutral-100 rounded-xl p-3 font-mono text-xs" value={raw} onChange={(e)=>setRaw(e.target.value)} />
      <div className="mt-3 flex gap-2">
        <button className="px-4 py-2 rounded-xl border border-neutral-700" onClick={()=>setRaw(JSON.stringify({ players, fixtures, matches }, null, 2))}>Refresh</button>
        <button className="px-4 py-2 rounded-xl bg-fuchsia-600/30 text-fuchsia-200 border border-fuchsia-500" onClick={()=>{ try{ const obj=JSON.parse(raw); if(!Array.isArray(obj.players)||!Array.isArray(obj.fixtures)||!Array.isArray(obj.matches)) throw new Error("Invalid format"); setAll(obj.players,obj.fixtures,obj.matches); alert("Data imported"); } catch(e){ alert("Import error: "+e.message); } }}>Import</button>
      </div>
    </div>
  );
}

function diff(a,b){ const d=a-b; return d>0?("+"+d):String(d); }
function buildStandings(players,matches){
  const map=new Map();
  for(const p of players){ map.set(p,{player:p,played:0,wins:0,losses:0,setsWon:0,setsLost:0,gamesWon:0,gamesLost:0}); }
  for(const m of matches){
    if(!map.has(m.a)||!map.has(m.b)) continue;
    const A=map.get(m.a), B=map.get(m.b);
    A.played++; B.played++;
    if(m.winner==="A"){A.wins++; B.losses++;} else if(m.winner==="B"){B.wins++; A.losses++;}
    for(const s of m.sets){ A.setsWon+=s.ga>s.gb?1:0; A.setsLost+=s.ga<s.gb?1:0; B.setsWon+=s.gb>s.ga?1:0; B.setsLost+=s.gb<s.ga?1:0; A.gamesWon+=s.ga; A.gamesLost+=s.gb; B.gamesWon+=s.gb; B.gamesLost+=s.ga; }
  }
  const rows=Array.from(map.values());
  rows.sort((r1,r2)=>{ const byWins=r2.wins-r1.wins; if(byWins) return byWins; const bySet=(r2.setsWon-r2.setsLost)-(r1.setsWon-r1.setsLost); if(bySet) return bySet; const byGame=(r2.gamesWon-r2.gamesLost)-(r1.gamesWon-r1.gamesLost); if(byGame) return byGame; return r1.player.localeCompare(r2.player); });
  return rows;
}
function groupByWeek(fixtures){
  const out={};
  for(const f of fixtures){ const key=f.week?String(f.week):isoWeekKey(f.date); (out[key] ||= []).push(f); }
  for(const k of Object.keys(out)){ out[k].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))); }
  return out;
}
function isoWeekKey(dateStr){ if(!dateStr) return "—"; const d=new Date(dateStr); if(isNaN(d)) return "—"; const tmp=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum=(tmp.getUTCDay()+6)%7; tmp.setUTCDate(tmp.getUTCDate()+3-dayNum); const week1=new Date(Date.UTC(tmp.getUTCFullYear(),0,4)); const weekNum=1+Math.round(((tmp-week1)/86400000-3+((week1.getUTCDay()+6)%7))/7); const y=tmp.getUTCFullYear(); return `${y}-W${String(weekNum).padStart(2,"0")}`; }

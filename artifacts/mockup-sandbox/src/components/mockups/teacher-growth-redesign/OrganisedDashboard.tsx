import { useState } from "react";
import { Bell, BookOpen, Check, ChevronRight, ClipboardCheck, Compass, FileText, GraduationCap, LayoutDashboard, Lightbulb, MoreHorizontal, Plus, Settings, ShieldCheck, Sparkles, Users } from "lucide-react";
import "./_group.css";

const nav = [
  [LayoutDashboard, "Dashboard"], [Compass, "Learning map"], [ClipboardCheck, "Self-assessment"], [BookOpen, "My CPD"],
  [Users, "Manager view"], [ShieldCheck, "Compliance"], [Settings, "Administration"],
] as const;

export default function OrganisedDashboard() {
  const [active, setActive] = useState("Dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(false);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };

  return <div className="tgd">
    <div className="tgd-shell">
      <aside className="tgd-side">
        <div className="tgd-brand"><span className="tgd-mark"><GraduationCap /></span><span>Teacher Growth<small>Professional workspace</small></span></div>
        <p className="tgd-nav-label">Your workspace</p>
        <nav className="tgd-nav" aria-label="Workspace navigation">
          {nav.slice(0, 4).map(([Icon, label]) => <button className={active === label ? "active" : ""} onClick={() => { setActive(label); if (label !== "Dashboard") flash(`${label} is ready to open.`); }} key={label}><Icon />{label}</button>)}
        </nav>
        <p className="tgd-nav-label">School</p>
        <nav className="tgd-nav" aria-label="School navigation">
          {nav.slice(4).map(([Icon, label]) => <button className={active === label ? "active" : ""} onClick={() => { setActive(label); flash(`${label} is ready to open.`); }} key={label}><Icon />{label}</button>)}
        </nav>
        <div className="tgd-role"><strong>Teacher view</strong>Greenfield Public School<br />Academic year 2026–27<button onClick={() => flash("Manager view selected for review.")}>Switch to manager view</button></div>
      </aside>

      <main className="tgd-main">
        <header className="tgd-top"><span className="tgd-crumb">Greenfield Public School / Professional growth</span><div className="tgd-top-right"><span>Tuesday, 14 July</span><button className="tgd-iconbtn" aria-label="Notifications" onClick={() => flash("No new notifications")}><Bell /></button><span className="tgd-avatar">NS</span></div></header>
        <div className="tgd-content">
          <div className="tgd-heading"><div><div className="tgd-eyebrow">Your daily workspace</div><h1>Good morning, Neha.</h1><p>Keep the small promises that make a difference in the classroom.</p></div><span className="tgd-year">2026–27 &nbsp; | &nbsp; Class Teacher, Grade 7</span></div>

          <div className="tgd-grid">
            <section>
              <article className="tgd-card tgd-today">
                <div className="tgd-sectionhead"><h2>Today’s focus</h2><span>1 action needs you</span></div>
                <div className="tgd-next">Add a brief reflection from your formative assessment workshop.</div>
                <p className="tgd-next-detail">Linked to: Assessment for learning · Due 16 July · About 5 minutes</p>
                <div className="tgd-actions"><button className="tgd-primary" onClick={() => flash("Reflection workspace opened.")}>Add reflection <ChevronRight size={14} /></button><button className="tgd-secondary" onClick={() => flash("Your learning map is ready.")}>View learning map</button></div>
              </article>

              <article className="tgd-card">
                <div className="tgd-sectionhead"><div><h2>Development priorities</h2><span>Ranked for your role and current evidence</span></div><button className="tgd-link" onClick={() => flash("All development priorities opened.")}>View all 3</button></div>
                <div className="tgd-priority"><span className="tgd-rank">01</span><div><h3>Assessment for learning</h3><p>Currently Developing · Expected Proficient · One level to grow</p></div><span className="tgd-badge">Highest focus</span></div>
                <div className="tgd-priority"><span className="tgd-rank">02</span><div><h3>Inclusive classroom practice</h3><p>Currently Developing · Expected Proficient · Evidence due in August</p></div><span className="tgd-badge mint">In progress</span></div>
                <div className="tgd-priority"><span className="tgd-rank">03</span><div><h3>Using data to adapt teaching</h3><p>Currently Emerging · Expected Developing · Plan next activity</p></div><span className="tgd-badge">Plan next</span></div>
              </article>

              <article className="tgd-card">
                <div className="tgd-sectionhead"><div><h2>Learning map</h2><span>Your active development, from intent to verified practice</span></div><button className="tgd-link" onClick={() => flash("Learning map opened.")}>Open map</button></div>
                <div className="tgd-timeline">
                  <div className="tgd-event"><span className="tgd-date">NOW<br />14 JUL</span><div><h3>Formative assessment in practice</h3><p>Reflection requested after workshop completion</p></div></div>
                  <div className="tgd-event"><span className="tgd-date">NEXT<br />22 JUL</span><div><h3>Peer observation with Aditi Rao</h3><p>Bring one assessment checkpoint from Grade 7B</p></div></div>
                  <div className="tgd-event"><span className="tgd-date">AUG<br />05</span><div><h3>Submit inclusive practice evidence</h3><p>Reviewer: R. Menon · Evidence window closes 11 August</p></div></div>
                </div>
              </article>
            </section>

            <aside>
              <article className="tgd-card">
                <div className="tgd-sectionhead"><div><h2>CPD commitment</h2><span>Annual requirement</span></div><button className="tgd-iconbtn" aria-label="More CPD options" onClick={() => flash("CPD detail opened.")}><MoreHorizontal /></button></div>
                <div className="tgd-progress"><div className="tgd-ring"><div><b>14.0</b><span>of 25 hrs</span></div></div><div><h3>On track</h3><p>11 hours remaining before 31 March 2027.</p><div className="tgd-meter"><i /></div><span className="tgd-meter-label">56% COMPLETE</span></div></div>
              </article>
              <article className="tgd-card">
                <div className="tgd-sectionhead"><div><h2>Goals</h2><span>2 open of 3 this year</span></div><button className="tgd-iconbtn" aria-label="Add goal" onClick={() => flash("New goal draft started.")}><Plus /></button></div>
                <div className="tgd-goal"><span className="tgd-check"><Check /></span><div><h3>Improve feedback cycles in Grade 7</h3><p>Due 30 September · 60% complete</p></div><span className="tgd-badge mint">On track</span></div>
                <div className="tgd-goal"><span className="tgd-check" style={{ background: "transparent", color: "transparent" }}><Check /></span><div><h3>Build routines for inclusive group work</h3><p>Due 15 November · Started</p></div><span className="tgd-badge">Active</span></div>
              </article>
              <article className="tgd-card">
                <div className="tgd-sectionhead"><div><h2>Evidence & review</h2><span>Keep your practice visible</span></div><button className="tgd-link" onClick={() => flash("Evidence library opened.")}>See all</button></div>
                {evidence ? <div className="tgd-evidence"><ShieldCheck /><div><h3>Lesson observation notes</h3><p>Submitted today · Awaiting reviewer decision</p></div></div> : <div className="tgd-evidence"><FileText /><div><h3>One item awaits your note</h3><p>Workshop reflection · Add before 16 July</p></div><button className="tgd-link" onClick={() => { setEvidence(true); flash("Evidence submitted for review."); }}>Submit</button></div>}
              </article>
              <article className="tgd-card">
                <div className="tgd-sectionhead"><div><h2>Professional pulse</h2><span>Verified this term</span></div><Lightbulb size={16} color="#21604c" /></div>
                <div className="tgd-empty">Your verified practice will appear here after your next review. It records observed change, not course attendance.</div>
              </article>
            </aside>
          </div>
        </div>
      </main>
    </div>
    {toast && <div className="tgd-toast"><Sparkles size={14} style={{ verticalAlign: "text-bottom", marginRight: 7 }} />{toast}</div>}
  </div>;
}
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';

type ViewMode = 'split' | 'form' | 'preview';
type PersonalLinks = { linkedin: string; github: string; website: string };
type PersonalInfo = { fullName: string; title: string; email: string; phone: string; location: string; summary: string; avatarBase64: string; links: PersonalLinks };
type Experience = { id: number; company: string; role: string; location: string; startDate: string; endDate: string; description: string };
type Project = { id: number; name: string; description: string; liveLink: string; githubLink: string };
type Education = { id: number; institution: string; degree: string; fieldOfStudy: string; startDate: string; endDate: string; description: string };
type Skill = { id: number; category: string; skills: string };
type Language = { id: number; language: string; level: string };
type ResumeData = { personal: PersonalInfo; experiences: Experience[]; projects: Project[]; education: Education[]; skills: Skill[]; languages: Language[] };
type SectionKey = 'experiences' | 'projects' | 'education' | 'skills' | 'languages';
type SectionMap = { experiences: Experience; projects: Project; education: Education; skills: Skill; languages: Language };
type ChangeableSectionMap = { [K in SectionKey]: Omit<SectionMap[K], 'id'> };

let idCounter = Date.now();
const createId = () => { idCounter += 1; return idCounter; };

const toImageSrc = (v: string) => {
  const t = v.trim();
  if (!t) return '';
  if (t.startsWith('data:image/')) return t;
  const c = t.replace(/\s/g, '');
  return /^[A-Za-z0-9+/=]+$/.test(c) ? `data:image/png;base64,${c}` : '';
};

const emptySectionItem: ChangeableSectionMap = {
  experiences: { company: '', role: '', location: '', startDate: '', endDate: '', description: '' },
  projects: { name: '', description: '', liveLink: '', githubLink: '' },
  education: { institution: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '', description: '' },
  skills: { category: '', skills: '' },
  languages: { language: '', level: '' },
};

const initialResume: ResumeData = {
  personal: { fullName: '', title: '', email: '', phone: '', location: '', summary: '', avatarBase64: '', links: { linkedin: '', github: '', website: '' } },
  experiences: [{ id: createId(), ...emptySectionItem.experiences }],
  projects: [{ id: createId(), ...emptySectionItem.projects }],
  education: [{ id: createId(), ...emptySectionItem.education }],
  skills: [{ id: createId(), ...emptySectionItem.skills }],
  languages: [{ id: createId(), ...emptySectionItem.languages }],
};

/* ══════════════════════════════
   PROGRESS CALCULATOR
══════════════════════════════ */
const calcProgress = (r: ResumeData): number => {
  const checks: boolean[] = [
    r.personal.fullName.trim().length > 0,
    r.personal.title.trim().length > 0,
    r.personal.email.trim().length > 0,
    r.personal.phone.trim().length > 0,
    r.personal.location.trim().length > 0,
    r.personal.summary.trim().length > 20,
    r.personal.avatarBase64.trim().length > 0,
    r.personal.links.linkedin.trim().length > 0 || r.personal.links.github.trim().length > 0,
    r.experiences.some(e => e.company.trim() && e.role.trim()),
    r.experiences.some(e => e.description.trim().length > 10),
    r.projects.some(p => p.name.trim() && p.description.trim()),
    r.education.some(e => e.institution.trim() && e.degree.trim()),
    r.skills.some(s => s.category.trim() && s.skills.trim()),
    r.languages.some(l => l.language.trim() && l.level.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const progressLabel = (p: number) => {
  if (p < 20) return { text: 'Только начали 🌱', color: '#f87171' };
  if (p < 40) return { text: 'Неплохое начало 🔥', color: '#fb923c' };
  if (p < 60) return { text: 'Набираем обороты ⚡', color: '#facc15' };
  if (p < 80) return { text: 'Почти готово 🚀', color: '#34d399' };
  if (p < 100) return { text: 'Выглядит отлично ✨', color: '#a78bfa' };
  return { text: 'Резюме готово! 🎉', color: '#818cf8' };
};

/* ══════════════════════════════
   ANIMATED ITEM WRAPPER
══════════════════════════════ */
const AnimatedItem = ({ children, visible }: { children: ReactNode; visible: boolean }) => {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;
  return (
    <div style={{
      opacity: show ? 1 : 0,
      transform: show ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.97)',
      transition: 'opacity 0.28s cubic-bezier(.4,0,.2,1), transform 0.28s cubic-bezier(.4,0,.2,1)',
    }}>
      {children}
    </div>
  );
};

/* ══════════════════════════════
   FLOATING LABEL COMPONENTS
══════════════════════════════ */
type FloatInputProps = { label: string; value: string; onChange: (v: string) => void; type?: string };
const FloatInput = ({ label, value, onChange, type = 'text' }: FloatInputProps) => {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;
  return (
    <div className="ff">
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="" autoComplete="off" className={`fi${focused ? ' fif' : ''}`} />
      <label className={`fl${lifted ? ' fll' : ''}${focused ? ' fla' : ''}`}>{label}</label>
      <span className={`fb${focused ? ' fba' : ''}`} />
    </div>
  );
};

type FloatAreaProps = { label?: string; value: string; onChange: (v: string) => void; rows?: number };
const FloatArea = ({ label, value, onChange, rows = 4 }: FloatAreaProps) => {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;
  return (
    <div className="ff">
      <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="" className={`fi fita${focused ? ' fif' : ''}`} />
      {label && <label className={`fl fltx${lifted ? ' fll' : ''}${focused ? ' fla' : ''}`}>{label}</label>}
      <span className={`fb${focused ? ' fba' : ''}`} />
    </div>
  );
};

type BareFloatProps = { label: string; value: string; onChange: (v: string) => void; type?: string };
const BareFloat = ({ label, value, onChange, type = 'text' }: BareFloatProps) => {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;
  return (
    <div className="ff">
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="" autoComplete="off" className={`fi${focused ? ' fif' : ''}`} />
      <label className={`fl${lifted ? ' fll' : ''}${focused ? ' fla' : ''}`}>{label}</label>
      <span className={`fb${focused ? ' fba' : ''}`} />
    </div>
  );
};

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9.5 7V5.8A1.8 1.8 0 0 1 11.3 4h1.4a1.8 1.8 0 0 1 1.8 1.8V7m-8 0 .7 11a2 2 0 0 0 2 1.9h6.6a2 2 0 0 0 2-1.9L17.5 7M10 11.2v5.6m4-5.6v5.6" />
  </svg>
);

type FormHandlers = {
  handlePersonalChange: <K extends keyof PersonalInfo>(field: K, value: PersonalInfo[K]) => void;
  handleLinkChange: <K extends keyof PersonalLinks>(field: K, value: PersonalLinks[K]) => void;
  addItem: <K extends SectionKey>(section: K) => void;
  removeItem: <K extends SectionKey>(section: K, id: number) => void;
  updateItem: <K extends SectionKey, F extends keyof ChangeableSectionMap[K]>(section: K, id: number, field: F, value: ChangeableSectionMap[K][F]) => void;
};

/* ══════════════════════════════
   ANIMATED SECTION
══════════════════════════════ */
type SectionProps<T extends { id: number }> = {
  title: string; emoji: string; items: T[];
  onAdd: () => void; onRemove: (id: number) => void;
  renderItem: (item: T) => ReactNode;
};

const Section = <T extends { id: number }>({ title, emoji, items, onAdd, onRemove, renderItem }: SectionProps<T>) => {
  const [visibleIds, setVisibleIds] = useState<Set<number>>(() => new Set(items.map(i => i.id)));
  const prevIds = useRef<Set<number>>(new Set(items.map(i => i.id)));

  useEffect(() => {
    const newIds = new Set(items.map(i => i.id));
    // items added
    newIds.forEach(id => {
      if (!prevIds.current.has(id)) {
        setVisibleIds(v => new Set([...v, id]));
      }
    });
    // items removed — animate out first
    prevIds.current.forEach(id => {
      if (!newIds.has(id)) {
        setVisibleIds(v => { const n = new Set(v); n.delete(id); return n; });
      }
    });
    prevIds.current = newIds;
  }, [items]);

  return (
    <section className="gc">
      <div className="sh"><span className="se">{emoji}</span><h2 className="st">{title}</h2></div>
      <div className="ic-list">
        {items.map(item => (
          <AnimatedItem key={item.id} visible={visibleIds.has(item.id)}>
            <div className="ic">
              <button onClick={() => onRemove(item.id)} type="button" aria-label="Удалить" className="db"><TrashIcon /></button>
              {renderItem(item)}
            </div>
          </AnimatedItem>
        ))}
      </div>
      <button onClick={onAdd} type="button" className="ab">＋ Добавить</button>
    </section>
  );
};

/* ══════════════════════════════
   PROGRESS BAR
══════════════════════════════ */
const ProgressBar = ({ resume }: { resume: ResumeData }) => {
  const pct = calcProgress(resume);
  const { text, color } = progressLabel(pct);
  return (
    <div className="prog-wrap">
      <div className="prog-top">
        <span className="prog-label">{text}</span>
        <span className="prog-pct" style={{ color }}>{pct}%</span>
      </div>
      <div className="prog-track">
        <div className="prog-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #7c3aed, ${color})` }} />
      </div>
      <div className="prog-steps">
        {[0,25,50,75,100].map(n => (
          <span key={n} className="prog-step" style={{ color: pct >= n ? color : undefined }}>{n}%</span>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════
   FORM VIEW
══════════════════════════════ */
const FormView = ({ resume, handlers }: { resume: ResumeData; handlers: FormHandlers }) => {
  const { handlePersonalChange, handleLinkChange, addItem, removeItem, updateItem } = handlers;
  const avatarSrc = toImageSrc(resume.personal.avatarBase64);
  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handlePersonalChange('avatarBase64', typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file); e.target.value = '';
  };

  return (
    <div className="form-stack">
      <section className="gc">
        <div className="sh"><span className="se">👤</span><h2 className="st">Личная информация</h2></div>
        <div className="g2">
          <FloatInput label="Полное имя" value={resume.personal.fullName} onChange={v => handlePersonalChange('fullName', v)} />
          <FloatInput label="Должность / Специализация" value={resume.personal.title} onChange={v => handlePersonalChange('title', v)} />
          <FloatInput label="Email" type="email" value={resume.personal.email} onChange={v => handlePersonalChange('email', v)} />
          <FloatInput label="Телефон" value={resume.personal.phone} onChange={v => handlePersonalChange('phone', v)} />
          <FloatInput label="Город, Страна" value={resume.personal.location} onChange={v => handlePersonalChange('location', v)} />
          <div>
            <p className="sub-label">Социальные ссылки</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {(['linkedin','github','website'] as const).map(k => (
                <BareFloat key={k} label={k === 'website' ? 'Сайт (URL)' : k.charAt(0).toUpperCase()+k.slice(1)+' URL'} type="url"
                  value={resume.personal.links[k]} onChange={v => handleLinkChange(k, v)} />
              ))}
            </div>
          </div>
          <div className="span2">
            <div className="avatar-box">
              <p className="sub-label" style={{ marginBottom: '0.75rem' }}>Фото профиля</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="fi-upload" />
                <button type="button" onClick={() => handlePersonalChange('avatarBase64', '')} className="clr-btn">Очистить</button>
              </div>
              <FloatArea label="Или вставьте Base64 строку…" value={resume.personal.avatarBase64} onChange={v => handlePersonalChange('avatarBase64', v)} rows={2} />
              {avatarSrc && (
                <div className="av-preview">
                  <img src={avatarSrc} alt="Preview" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  <span className="sub-label">Фото готово ✨</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <FloatArea label="Профессиональное резюме / О себе" value={resume.personal.summary} onChange={v => handlePersonalChange('summary', v)} rows={4} />
        </div>
      </section>

      <Section<Experience> title="Опыт работы" emoji="💼" items={resume.experiences}
        onAdd={() => addItem('experiences')} onRemove={id => removeItem('experiences', id)}
        renderItem={item => (
          <div className="inner-stack">
            <div className="g2">
              <BareFloat label="Компания" value={item.company} onChange={v => updateItem('experiences', item.id, 'company', v)} />
              <BareFloat label="Должность" value={item.role} onChange={v => updateItem('experiences', item.id, 'role', v)} />
            </div>
            <BareFloat label="Город / Локация" value={item.location} onChange={v => updateItem('experiences', item.id, 'location', v)} />
            <div className="g2">
              <BareFloat label="Дата начала" type="date" value={item.startDate} onChange={v => updateItem('experiences', item.id, 'startDate', v)} />
              <BareFloat label="Дата окончания" type="date" value={item.endDate} onChange={v => updateItem('experiences', item.id, 'endDate', v)} />
            </div>
            <FloatArea label="Обязанности и достижения" value={item.description} onChange={v => updateItem('experiences', item.id, 'description', v)} rows={3} />
          </div>
        )} />

      <Section<Project> title="Проекты" emoji="🚀" items={resume.projects}
        onAdd={() => addItem('projects')} onRemove={id => removeItem('projects', id)}
        renderItem={item => (
          <div className="inner-stack">
            <BareFloat label="Название проекта" value={item.name} onChange={v => updateItem('projects', item.id, 'name', v)} />
            <FloatArea label="Описание проекта" value={item.description} onChange={v => updateItem('projects', item.id, 'description', v)} rows={3} />
            <div className="g2">
              <BareFloat label="Ссылка на сайт" type="url" value={item.liveLink} onChange={v => updateItem('projects', item.id, 'liveLink', v)} />
              <BareFloat label="Ссылка на GitHub" type="url" value={item.githubLink} onChange={v => updateItem('projects', item.id, 'githubLink', v)} />
            </div>
          </div>
        )} />

      <Section<Education> title="Образование" emoji="🎓" items={resume.education}
        onAdd={() => addItem('education')} onRemove={id => removeItem('education', id)}
        renderItem={item => (
          <div className="inner-stack">
            <BareFloat label="Учебное заведение" value={item.institution} onChange={v => updateItem('education', item.id, 'institution', v)} />
            <div className="g2">
              <BareFloat label="Степень / Уровень" value={item.degree} onChange={v => updateItem('education', item.id, 'degree', v)} />
              <BareFloat label="Специальность" value={item.fieldOfStudy} onChange={v => updateItem('education', item.id, 'fieldOfStudy', v)} />
            </div>
            <div className="g2">
              <BareFloat label="Дата начала" type="date" value={item.startDate} onChange={v => updateItem('education', item.id, 'startDate', v)} />
              <BareFloat label="Дата окончания" type="date" value={item.endDate} onChange={v => updateItem('education', item.id, 'endDate', v)} />
            </div>
            <FloatArea label="Заметки / Достижения" value={item.description} onChange={v => updateItem('education', item.id, 'description', v)} rows={2} />
          </div>
        )} />

      <Section<Skill> title="Навыки" emoji="⚡" items={resume.skills}
        onAdd={() => addItem('skills')} onRemove={id => removeItem('skills', id)}
        renderItem={item => (
          <div className="inner-stack">
            <BareFloat label="Категория (напр. Frontend)" value={item.category} onChange={v => updateItem('skills', item.id, 'category', v)} />
            <BareFloat label="Навыки через запятую" value={item.skills} onChange={v => updateItem('skills', item.id, 'skills', v)} />
          </div>
        )} />

      <Section<Language> title="Языки" emoji="🌍" items={resume.languages}
        onAdd={() => addItem('languages')} onRemove={id => removeItem('languages', id)}
        renderItem={item => (
          <div className="g2">
            <BareFloat label="Язык" value={item.language} onChange={v => updateItem('languages', item.id, 'language', v)} />
            <div className="ff">
              <select value={item.level} onChange={e => updateItem('languages', item.id, 'level', e.target.value)} className="fi fi-sel">
                <option value="">Выберите уровень</option>
                {[['Beginner','Начинающий'],['Intermediate','Средний'],['Advanced','Продвинутый'],['Fluent','Свободный']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        )} />
    </div>
  );
};

/* ══════════════════════════════
   PREVIEW CONTENT (shared)
══════════════════════════════ */
const PreviewContent = ({ resume, dark }: { resume: ResumeData; dark: boolean }) => {
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('ru-RU', { year: 'numeric', month: 'short' }) : '';
  const range = (s: string, e: string) => { const a=fmt(s),b=fmt(e); return a&&b?`${a} – ${b}`:a?`${a} – н.в.`:b||''; };
  const toUrl = (u: string) => { const t=u.trim(); return t?(/^https?:\/\//i.test(t)?t:`https://${t}`):''; };

  const hasLinks = resume.personal.links.linkedin||resume.personal.links.github||resume.personal.links.website;
  const avatarSrc = toImageSrc(resume.personal.avatarBase64);

  const bg = dark ? '#ffffff' : '#ffffff';
  const bodyBg = dark ? '#f8fafc' : '#f8fafc';
  const headBg = dark ? 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)' : 'linear-gradient(135deg,#f0f4ff,#e8e0ff,#fdf2ff)';
  const headText = dark ? '#ffffff' : '#1e1b4b';
  const headSub = dark ? '#c4b5fd' : '#6d28d9';
  const headMeta = dark ? '#a5b4fc' : '#7c3aed';
  const accent = '#7c3aed';
  const bodyText = '#1e293b';
  const mutedText = '#64748b';
  const badgeBg = dark ? 'rgba(255,255,255,0.13)' : 'rgba(109,40,217,0.09)';
  const badgeBorder = dark ? 'rgba(255,255,255,0.22)' : 'rgba(109,40,217,0.22)';
  const badgeText = dark ? '#fff' : '#6d28d9';
  const sectionBorder = dark ? '#e2e8f0' : '#e9d5ff';
  const dateBg = dark ? '#f1f5f9' : '#f5f3ff';
  const dateText = dark ? '#94a3b8' : '#7c3aed';
  const langBg = dark ? '#f8fafc' : '#f5f3ff';

  const STitle = ({ children }: { children: ReactNode }) => (
    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent, borderBottom: `2px solid ${sectionBorder}`, paddingBottom: '0.45rem', marginBottom: '1rem' }}>{children}</div>
  );

  return (
    <div style={{ background: bg, borderRadius: 16, overflow: 'hidden', fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: '14px' }}>
      {/* Header */}
      <div style={{ background: headBg, padding: '2rem 2.5rem', color: headText }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem' }}>
          <div>
            {resume.personal.fullName && <h1 style={{ fontFamily: "'Fraunces',Georgia,serif", fontSize: 'clamp(1.6rem,4vw,2.5rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0, color: headText }}>{resume.personal.fullName}</h1>}
            {resume.personal.title && <p style={{ color: headSub, fontSize: '1rem', fontWeight: 600, marginTop: '0.35rem' }}>{resume.personal.title}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', marginTop: '0.85rem', color: headMeta, fontSize: '0.8rem' }}>
              {resume.personal.location && <span>📍 {resume.personal.location}</span>}
              {resume.personal.phone && <span>📞 {resume.personal.phone}</span>}
              {resume.personal.email && <span>✉ {resume.personal.email}</span>}
            </div>
            {hasLinks && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.75rem' }}>
                {resume.personal.links.linkedin && <a href={toUrl(resume.personal.links.linkedin)} target="_blank" rel="noreferrer" style={{ background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 7, padding: '2px 11px', fontSize: '0.72rem', fontWeight: 700, color: badgeText, textDecoration: 'none' }}>LinkedIn</a>}
                {resume.personal.links.github && <a href={toUrl(resume.personal.links.github)} target="_blank" rel="noreferrer" style={{ background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 7, padding: '2px 11px', fontSize: '0.72rem', fontWeight: 700, color: badgeText, textDecoration: 'none' }}>GitHub</a>}
                {resume.personal.links.website && <a href={toUrl(resume.personal.links.website)} target="_blank" rel="noreferrer" style={{ background: badgeBg, border: `1px solid ${badgeBorder}`, borderRadius: 7, padding: '2px 11px', fontSize: '0.72rem', fontWeight: 700, color: badgeText, textDecoration: 'none' }}>Сайт</a>}
              </div>
            )}
          </div>
          {avatarSrc && <img src={avatarSrc} alt="Фото" style={{ width: 96, height: 96, borderRadius: 14, objectFit: 'cover', border: `3px solid ${dark ? 'rgba(255,255,255,0.25)' : 'rgba(109,40,217,0.25)'}`, flexShrink: 0 }} />}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '2rem 2.5rem', background: bodyBg, display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {resume.personal.summary && <div><STitle>О себе</STitle><p style={{ color: mutedText, lineHeight: 1.8, fontSize: '0.88rem' }}>{resume.personal.summary}</p></div>}

        {resume.experiences.some(e=>e.company||e.role) && (
          <div><STitle>Опыт работы</STitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {resume.experiences.map(exp=>(exp.company||exp.role)&&(
                <div key={exp.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                      {exp.company && <div style={{ fontWeight: 700, fontSize: '0.95rem', color: bodyText, fontFamily: "'Fraunces',Georgia,serif" }}>{exp.company}</div>}
                      {exp.role && <div style={{ color: accent, fontWeight: 600, fontSize: '0.82rem' }}>{exp.role}</div>}
                    </div>
                    {range(exp.startDate,exp.endDate) && <span style={{ background: dateBg, borderRadius: 6, padding: '2px 9px', fontSize: '0.7rem', color: dateText, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{range(exp.startDate,exp.endDate)}</span>}
                  </div>
                  {exp.location && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{exp.location}</div>}
                  {exp.description && <p style={{ color: mutedText, marginTop: '0.4rem', fontSize: '0.83rem', lineHeight: 1.75 }}>{exp.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {resume.projects.some(p=>p.name||p.description) && (
          <div><STitle>Проекты</STitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {resume.projects.map(p=>(p.name||p.description)&&(
                <div key={p.id}>
                  {p.name && <div style={{ fontWeight: 700, color: bodyText, fontSize: '0.9rem', fontFamily: "'Fraunces',Georgia,serif" }}>{p.name}</div>}
                  {p.description && <p style={{ color: mutedText, marginTop: 3, fontSize: '0.83rem', lineHeight: 1.75 }}>{p.description}</p>}
                  <div style={{ display: 'flex', gap: '0.85rem', marginTop: 5 }}>
                    {p.liveLink && <a href={toUrl(p.liveLink)} target="_blank" rel="noreferrer" style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}>↗ Сайт</a>}
                    {p.githubLink && <a href={toUrl(p.githubLink)} target="_blank" rel="noreferrer" style={{ color: mutedText, fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}>⌥ GitHub</a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {resume.education.some(e=>e.institution||e.degree) && (
          <div><STitle>Образование</STitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {resume.education.map(ed=>(ed.institution||ed.degree)&&(
                <div key={ed.id}>
                  {ed.institution && <div style={{ fontWeight: 700, color: bodyText, fontFamily: "'Fraunces',Georgia,serif", fontSize: '0.9rem' }}>{ed.institution}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginTop: 3 }}>
                    {(ed.degree||ed.fieldOfStudy) && <div style={{ color: accent, fontWeight: 600, fontSize: '0.82rem' }}>{ed.degree}{ed.degree&&ed.fieldOfStudy?' ':''}{ed.fieldOfStudy?`— ${ed.fieldOfStudy}`:''}</div>}
                    {range(ed.startDate,ed.endDate) && <span style={{ background: dateBg, borderRadius: 6, padding: '2px 9px', fontSize: '0.7rem', color: dateText, fontWeight: 700, flexShrink: 0 }}>{range(ed.startDate,ed.endDate)}</span>}
                  </div>
                  {ed.description && <p style={{ color: mutedText, marginTop: 3, fontSize: '0.83rem' }}>{ed.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {resume.skills.some(s=>s.category||s.skills) && (
          <div><STitle>Навыки</STitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {resume.skills.map(s=>(s.category||s.skills)&&(
                <div key={s.id} style={{ display: 'flex', gap: '0.85rem', alignItems: 'baseline', fontSize: '0.83rem' }}>
                  {s.category && <span style={{ fontWeight: 700, color: bodyText, width: 100, flexShrink: 0 }}>{s.category}</span>}
                  {s.skills && <span style={{ color: mutedText }}>{s.skills}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {resume.languages.some(l=>l.language) && (
          <div><STitle>Языки</STitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: '0.45rem' }}>
              {resume.languages.map(l=>l.language&&(
                <div key={l.id} style={{ background: langBg, borderRadius: 9, padding: '6px 12px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: 700, color: bodyText }}>{l.language}</span>
                  <span style={{ color: mutedText }}>{l.level}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════════
   PREVIEW VIEW (full page)
══════════════════════════════ */
const PreviewView = ({ resume, dark, onToggleDark }: { resume: ResumeData; dark: boolean; onToggleDark: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!ref.current||saving) return;
    setSaving(true); setErr('');
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const rect = ref.current.getBoundingClientRect();
      const links = Array.from(ref.current.querySelectorAll('a[href]')).map(a => {
        const h=a.getAttribute('href')||''; const r=a.getBoundingClientRect();
        return { h, x:r.left-rect.left, y:r.top-rect.top, w:r.width, ht:r.height };
      }).filter(i=>i.h&&i.w>0);
      const name = `${(resume.personal.fullName||'resume').trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}-resume.pdf`;
      const url = await toPng(ref.current, { cacheBust:true, pixelRatio:2, backgroundColor:'#ffffff' });
      const pdf = new jsPDF('p','mm','a4');
      const pw=pdf.internal.pageSize.getWidth(), ph=pdf.internal.pageSize.getHeight();
      const img=new Image(); img.src=url;
      await new Promise<void>((res,rej)=>{img.onload=()=>res();img.onerror=()=>rej();});
      const m=10,c=2,cx=m+c,cy=m+c,cw=pw-(m+c)*2,ch=ph-(m+c)*2;
      const rh=(img.height*cw)/img.width, pages=Math.max(1,Math.ceil(rh/ch));
      for(let p=0;p<pages;p++){
        if(p>0) pdf.addPage();
        pdf.setFillColor(248,250,252); pdf.rect(m,m,pw-m*2,ph-m*2,'F');
        pdf.setDrawColor(226,232,240); pdf.setLineWidth(0.3); pdf.rect(m,m,pw-m*2,ph-m*2,'S');
        pdf.addImage(url,'PNG',cx,cy-p*ch,cw,rh,undefined,'FAST');
        if(rect.width>0){
          const sc=cw/rect.width;
          links.forEach(lk=>{
            const ly=lk.y*sc,lh=lk.ht*sc,le=ly+lh,ps=p*ch,pe=ps+ch;
            if(le<=ps||ly>=pe) return;
            const ct=Math.max(ly,ps),cb=Math.min(le,pe),vh=cb-ct; if(vh<=0) return;
            pdf.link(cx+lk.x*sc,cy+(ct-ps),lk.w*sc,vh,{url:lk.h});
          });
        }
      }
      pdf.save(name);
    } catch(e){ console.error(e); setErr('Ошибка при сохранении PDF.'); }
    finally{ setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="sub-label">Режим просмотра</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" onClick={onToggleDark} className="theme-btn" title="Переключить тему">
            {dark ? '☀️ Светлая тема' : '🌙 Тёмная тема'}
          </button>
          <button type="button" onClick={save} disabled={saving} className="save-btn">{saving ? 'Сохранение…' : '⬇ Скачать PDF'}</button>
        </div>
      </div>
      {err && <p style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'right', marginBottom: '0.75rem' }}>{err}</p>}
      <div ref={ref}><PreviewContent resume={resume} dark={dark} /></div>
    </div>
  );
};

/* ══════════════════════════════
   ROOT
══════════════════════════════ */
const ResumeBuilder = () => {
  const [view, setView] = useState<ViewMode>('form');
  const [resume, setResume] = useState<ResumeData>(initialResume);
  const [darkPreview, setDarkPreview] = useState(true);

  const handlePersonalChange: FormHandlers['handlePersonalChange'] = (f, v) =>
    setResume(p => ({ ...p, personal: { ...p.personal, [f]: v } }));
  const handleLinkChange: FormHandlers['handleLinkChange'] = (f, v) =>
    setResume(p => ({ ...p, personal: { ...p.personal, links: { ...p.personal.links, [f]: v } } }));
  const addItem: FormHandlers['addItem'] = s =>
    setResume(p => ({ ...p, [s]: [...p[s], { id: Date.now(), ...emptySectionItem[s] }] }));
  const removeItem: FormHandlers['removeItem'] = (s, id) =>
    setResume(p => { const f=p[s].filter(i=>i.id!==id); return { ...p, [s]: f.length?f:[{ id:Date.now(),...emptySectionItem[s] }] }; });
  const updateItem: FormHandlers['updateItem'] = (s, id, f, v) =>
    setResume(p => ({ ...p, [s]: p[s].map(i=>i.id===id?{...i,[f]:v}:i) }));

  const handlers = { handlePersonalChange, handleLinkChange, addItem, removeItem, updateItem };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,600,100;9..144,700,100;9..144,800,100&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0b0b12; --surf: #11111c; --surf2: #181826;
          --bdr: rgba(255,255,255,0.07); --acc: #8b5cf6; --acc2: #a78bfa;
          --text: #e2e8f0; --muted: #64748b; --dim: #94a3b8;
          --ibg: rgba(255,255,255,0.04); --ihov: rgba(139,92,246,0.09); --ifoc: rgba(139,92,246,0.06);
          --glow: 0 0 0 3px rgba(139,92,246,0.22), 0 6px 24px -8px rgba(139,92,246,0.45);
          --r: 13px;
        }
        body { font-family:'Plus Jakarta Sans',sans-serif; background:var(--bg); color:var(--text); min-height:100vh; }

        /* ── Navbar ── */
        .navbar { position:sticky; top:0; z-index:50; background:rgba(11,11,18,0.9); border-bottom:1px solid var(--bdr); backdrop-filter:blur(22px); }
        .nav-inner { max-width:1400px; margin:0 auto; display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; justify-content:space-between; padding:0.85rem 1.5rem; }
        .logo-wrap { display:flex; align-items:center; gap:0.6rem; }
        .logo-mark { width:36px; height:36px; border-radius:10px; flex-shrink:0; background:linear-gradient(135deg,#7c3aed,#a78bfa); display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.05rem; color:#fff; box-shadow:0 4px 16px -4px rgba(139,92,246,0.65); }
        .logo-name { font-family:'Fraunces',Georgia,serif; font-size:1.55rem; font-weight:700; letter-spacing:-0.03em; background:linear-gradient(135deg,#a78bfa,#e9d5ff); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .logo-tag { font-size:0.65rem; color:var(--muted); font-weight:600; letter-spacing:0.08em; text-transform:uppercase; }
        .tab-group { display:flex; gap:3px; background:rgba(255,255,255,0.04); border:1px solid var(--bdr); border-radius:12px; padding:3px; }
        .tab-btn { padding:0.5rem 1rem; border-radius:9px; border:none; font-size:0.82rem; font-weight:700; font-family:'Plus Jakarta Sans',sans-serif; cursor:pointer; transition:all 0.18s; background:transparent; color:var(--muted); white-space:nowrap; }
        .tab-btn:hover:not(.tba) { background:rgba(255,255,255,0.06); color:var(--text); }
        .tab-btn.tba { background:linear-gradient(135deg,#6d28d9,#7c3aed); color:#fff; box-shadow:0 3px 14px -4px rgba(139,92,246,0.6); }

        /* ── Progress Bar ── */
        .prog-wrap { max-width:1400px; margin:0 auto; padding:0.75rem 1.5rem 0; }
        .prog-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; }
        .prog-label { font-size:0.78rem; font-weight:700; color:var(--dim); }
        .prog-pct { font-size:0.9rem; font-weight:900; font-family:'Fraunces',Georgia,serif; transition:color 0.4s; }
        .prog-track { height:6px; background:rgba(255,255,255,0.07); border-radius:99px; overflow:hidden; }
        .prog-fill { height:100%; border-radius:99px; transition:width 0.5s cubic-bezier(.4,0,.2,1), background 0.5s; }
        .prog-steps { display:flex; justify-content:space-between; margin-top:0.3rem; }
        .prog-step { font-size:0.6rem; font-weight:700; color:var(--muted); transition:color 0.4s; }

        /* ── Layout ── */
        .main-wrap { max-width:1400px; margin:0 auto; padding:1.25rem 1.5rem 2rem; }
        .split-layout { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; align-items:start; }
        @media (max-width:900px) { .split-layout { grid-template-columns:1fr; } }
        .split-preview-pane { position:sticky; top:80px; max-height:calc(100vh - 100px); overflow-y:auto; border-radius:16px; scrollbar-width:thin; scrollbar-color:rgba(139,92,246,0.3) transparent; }
        .split-preview-pane::-webkit-scrollbar { width:4px; }
        .split-preview-pane::-webkit-scrollbar-thumb { background:rgba(139,92,246,0.3); border-radius:2px; }
        .split-preview-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; }
        .form-stack { display:flex; flex-direction:column; gap:1.25rem; }

        /* ── Glass card ── */
        .gc { background:var(--surf); border:1px solid var(--bdr); border-radius:20px; padding:1.75rem; transition:border-color 0.2s; }
        .gc:hover { border-color:rgba(139,92,246,0.18); }
        .sh { display:flex; align-items:center; gap:0.65rem; margin-bottom:1.4rem; }
        .se { font-size:1.35rem; }
        .st { font-family:'Fraunces',Georgia,serif; font-size:1.25rem; font-weight:700; color:var(--text); letter-spacing:-0.02em; }

        /* ── Item card ── */
        .ic-list { display:flex; flex-direction:column; gap:1rem; }
        .ic { position:relative; background:var(--surf2); border:1px solid var(--bdr); border-radius:var(--r); padding:1.25rem; transition:border-color 0.18s,box-shadow 0.18s,transform 0.15s; }
        .ic:hover { border-color:rgba(139,92,246,0.28); box-shadow:0 6px 28px -10px rgba(139,92,246,0.28); transform:translateY(-1px); }
        .db { position:absolute; top:11px; right:11px; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:rgba(244,63,94,0.08); border:1px solid rgba(244,63,94,0.18); color:#f43f5e; cursor:pointer; opacity:0; transition:opacity 0.15s,background 0.15s,transform 0.15s; }
        .ic:hover .db { opacity:1; }
        .db:hover { background:rgba(244,63,94,0.2); transform:scale(1.12); }
        .ab { width:100%; margin-top:1rem; display:flex; align-items:center; justify-content:center; gap:0.4rem; padding:0.7rem; border-radius:var(--r); border:1.5px dashed rgba(139,92,246,0.28); background:rgba(139,92,246,0.04); color:var(--acc2); font-size:0.85rem; font-weight:700; font-family:'Plus Jakarta Sans',sans-serif; cursor:pointer; transition:all 0.18s; }
        .ab:hover { border-color:var(--acc); background:rgba(139,92,246,0.1); color:#c4b5fd; transform:translateY(-1px); box-shadow:0 4px 16px -6px rgba(139,92,246,0.35); }

        /* ── Float fields ── */
        .ff { position:relative; }
        .fi { width:100%; padding:1.15rem 0.95rem 0.42rem; background:var(--ibg); border:1.5px solid rgba(255,255,255,0.09); border-radius:var(--r); color:var(--text); font-family:'Plus Jakarta Sans',sans-serif; font-size:0.92rem; line-height:1.4; outline:none; transition:background 0.18s,border-color 0.18s,box-shadow 0.18s,transform 0.15s; -webkit-appearance:none; appearance:none; }
        .fi:hover { background:var(--ihov); border-color:rgba(139,92,246,0.5); box-shadow:0 0 0 3px rgba(139,92,246,0.12); transform:translateY(-1px); }
        .fi:hover + .fl { color:var(--acc2); }
        .fif, .fi:focus { background:var(--ifoc) !important; border-color:var(--acc) !important; box-shadow:var(--glow) !important; transform:translateY(0) !important; }
        .fita { resize:none; padding-top:1.3rem; }
        .fi-sel { padding-top:0.85rem; padding-bottom:0.42rem; }
        .fi-sel option { background:#1a1a2e; color:var(--text); }
        .fl { position:absolute; left:0.95rem; top:50%; transform:translateY(-50%); font-size:0.88rem; font-weight:500; color:var(--muted); pointer-events:none; transition:top 0.22s cubic-bezier(.4,0,.2,1),transform 0.22s cubic-bezier(.4,0,.2,1),font-size 0.22s,color 0.18s,letter-spacing 0.18s; white-space:nowrap; }
        .fltx { top:1.2rem; transform:none; }
        .fl.fll { top:0.38rem; transform:none; font-size:0.65rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; color:var(--dim); }
        .fltx.fll { top:0.38rem; }
        .fl.fla { color:var(--acc2) !important; }
        .fb { position:absolute; bottom:0; left:50%; width:0; height:2px; background:linear-gradient(90deg,#8b5cf6,#a78bfa,#e9d5ff); border-radius:1px; transform:translateX(-50%); transition:width 0.25s cubic-bezier(.4,0,.2,1); pointer-events:none; }
        .fba { width:calc(100% - 4px); }

        /* ── Grids ── */
        .g2 { display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; }
        @media (max-width:600px) { .g2 { grid-template-columns:1fr; } }
        .span2 { grid-column:span 2; }
        @media (max-width:600px) { .span2 { grid-column:span 1; } }
        .gc .g2 { gap:1.1rem; }
        .inner-stack { display:flex; flex-direction:column; gap:0.85rem; }

        /* ── Avatar ── */
        .avatar-box { background:var(--surf2); border:1px solid var(--bdr); border-radius:var(--r); padding:1.1rem; }
        .av-preview { display:flex; align-items:center; gap:0.7rem; margin-top:0.7rem; background:rgba(139,92,246,0.07); border:1px solid rgba(139,92,246,0.18); border-radius:10px; padding:0.65rem; }
        .fi-upload { font-size:0.78rem; color:var(--muted); font-family:'Plus Jakarta Sans',sans-serif; }
        .fi-upload::file-selector-button { background:var(--acc); color:#fff; border:none; border-radius:8px; padding:5px 12px; margin-right:8px; font-size:0.72rem; font-weight:800; font-family:'Plus Jakarta Sans',sans-serif; cursor:pointer; transition:background 0.15s; }
        .fi-upload::file-selector-button:hover { background:#6d28d9; }
        .clr-btn { background:transparent; border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:5px 14px; color:var(--dim); font-size:0.72rem; font-weight:800; font-family:'Plus Jakarta Sans',sans-serif; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
        .clr-btn:hover { border-color:#f43f5e; color:#f43f5e; }

        /* ── Buttons ── */
        .sub-label { font-size:0.68rem; font-weight:800; letter-spacing:0.09em; text-transform:uppercase; color:var(--muted); }
        .save-btn { background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#fff; border:none; border-radius:12px; padding:0.6rem 1.35rem; font-size:0.875rem; font-weight:800; font-family:'Plus Jakarta Sans',sans-serif; cursor:pointer; box-shadow:0 4px 18px -6px rgba(139,92,246,0.55); transition:all 0.18s; }
        .save-btn:hover { transform:translateY(-2px); box-shadow:0 8px 26px -6px rgba(139,92,246,0.7); }
        .save-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
        .theme-btn { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:0.55rem 1rem; font-size:0.8rem; font-weight:700; font-family:'Plus Jakarta Sans',sans-serif; color:var(--dim); cursor:pointer; transition:all 0.18s; white-space:nowrap; }
        .theme-btn:hover { background:rgba(255,255,255,0.1); color:var(--text); border-color:rgba(255,255,255,0.2); }


        @media (max-width:560px){
          .fi{padding:0.9rem 0.7rem 0.32rem;font-size:0.85rem;}
          .fi-sel{padding-top:0.7rem;padding-bottom:0.32rem;}
          .fl{font-size:0.76rem;}
          .fl.fll{font-size:0.58rem;}
        }        input[type="date"].fi { padding-top:1.15rem; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter:invert(0.55); cursor:pointer; }
      `}</style>

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-inner">
          <div className="logo-wrap">
            <div className="logo-mark">S</div>
            <div>
              <div className="logo-name">Soul Gudman</div>
              <div className="logo-tag">Конструктор резюме</div>
            </div>
          </div>
          <div className="tab-group">
            {([['form','✏️ Редактор'],['split','⚡ Split view'],['preview','👁 Просмотр']] as const).map(([v,l]) => (
              <button key={v} onClick={() => setView(v as ViewMode)} type="button" className={`tab-btn${view===v?' tba':''}`}>{l}</button>
            ))}
          </div>
        </div>
      </nav>

      {/* Progress Bar */}
      <div className="prog-wrap">
        <ProgressBar resume={resume} />
      </div>

      {/* Main */}
      <main className="main-wrap">
        {view === 'form' && (
          <FormView resume={resume} handlers={handlers} />
        )}

        {view === 'preview' && (
          <PreviewView resume={resume} dark={darkPreview} onToggleDark={() => setDarkPreview(d => !d)} />
        )}

        {view === 'split' && (
          <div className="split-layout">
            {/* Left: form */}
            <div><FormView resume={resume} handlers={handlers} /></div>
            {/* Right: live preview */}
            <div>
              <div className="split-preview-header">
                <span className="sub-label">Предпросмотр в реальном времени</span>
                <button type="button" onClick={() => setDarkPreview(d => !d)} className="theme-btn">
                  {darkPreview ? '☀️ Светлая' : '🌙 Тёмная'}
                </button>
              </div>
              <div className="split-preview-pane">
                <PreviewContent resume={resume} dark={darkPreview} />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
};

export default ResumeBuilder;

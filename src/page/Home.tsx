import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from 'firebase/firestore';
import { appleProvider, auth, db, googleProvider, microsoftProvider } from '../firebase';
import '../index.css';

// ─── Types ────────────────────────────────────────────────
type Page = 'login' | 'home' | 'carpark' | 'cardetail' | 'about' | 'contacts' | 'admin';
type UserRole = 'admin' | 'user' | '';
type MessageSender = 'user' | 'admin';
type ThemeMode = 'dark' | 'light';
type SocialProvider = 'google' | 'apple' | 'microsoft';

const AUTH_STORAGE_KEY = 'dlrent_auth';
const AUTH_CHANGE_EVENT = 'dlrent-auth-change';
const THEME_STORAGE_KEY = 'dlrent_theme';
const ADMIN_EMAIL = 'admin987@gmail.com';
const API_URL = '';
const ENABLE_GOOGLE_AUTH = import.meta.env.VITE_ENABLE_GOOGLE_AUTH !== 'false';
const ENABLE_APPLE_AUTH = import.meta.env.VITE_ENABLE_APPLE_AUTH !== 'false';
const ENABLE_MICROSOFT_AUTH = import.meta.env.VITE_ENABLE_MICROSOFT_AUTH !== 'false';
const DEFAULT_CAR_IMAGE = '/src/assets/aventus-car.svg';

// ─── Helpers ──────────────────────────────────────────────
const getPrimaryCarImage = (car: Pick<Car, 'imageGallery'>) => {
  const first = car.imageGallery?.find(img => typeof img === 'string' && img.trim().length > 0);
  return first ?? DEFAULT_CAR_IMAGE;
};

const getBookingReturnTime = (b: Pick<Booking, 'returnTime'>) =>
  typeof b.returnTime === 'string' && b.returnTime.trim() ? b.returnTime : '23:59';

const getBookingReturnAtMs = (b: Pick<Booking, 'returnDate' | 'returnTime'>) => {
  const d = new Date(`${b.returnDate}T${getBookingReturnTime(b)}:00`);
  return Number.isFinite(d.getTime()) ? d.getTime() : Number.MAX_SAFE_INTEGER;
};

const createNumericId = () => Date.now() + Math.floor(Math.random() * 100000);

const isMobileAuthEnvironment = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.matchMedia('(max-width: 1024px)').matches;
};

// ─── Interfaces ───────────────────────────────────────────
interface StoredAuth { userName: string; userRole: Exclude<UserRole, ''>; }

interface Car {
  id: number; name: string; price: string; features: string[];
  image: string; imageGallery?: string[]; rating: number; quantity: number;
}

interface BookingInput {
  carId: number; carName: string; phoneNumber?: string;
  pickupDate: string; returnDate: string; returnTime?: string; timestamp: string;
}

interface Booking extends BookingInput {
  id: number; status: 'active' | 'completed'; userName: string;
}

interface ChatMessage {
  id: number; bookingId: number; text: string;
  sender: MessageSender; time: string; read: boolean;
}

type NavigateFn = (page: Page, carId?: number | null) => void;
type SendMessageFn = (bookingId: number, text: string, sender?: MessageSender) => Promise<boolean>;

// ─── apiFetch (Firestore adapter) ─────────────────────────
interface ApiJsonResponse<T = unknown> {
  ok: boolean; status: number; json: () => Promise<T>;
}

const createApiJsonResponse = <T,>(data: T, status = 200): ApiJsonResponse<T> => ({
  ok: status >= 200 && status < 300, status, json: async () => data,
});

const parseApiPath = (url: string) => {
  try { return new URL(url).pathname; } catch { return url.startsWith('/') ? url : `/${url}`; }
};

const apiFetch = async (url: string, init?: RequestInit): Promise<ApiJsonResponse> => {
  const method = (init?.method ?? 'GET').toUpperCase();
  const path = parseApiPath(url);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

  try {
    if (path === '/cars' && method === 'GET') {
      const snap = await getDocs(collection(db, 'car'));
      return createApiJsonResponse(snap.docs.map(d => d.data()));
    }
    if (path === '/bookings' && method === 'GET') {
      const snap = await getDocs(collection(db, 'bookings'));
      return createApiJsonResponse(snap.docs.map(d => d.data()));
    }
    if (path === '/messages' && method === 'GET') {
      const snap = await getDocs(collection(db, 'messages'));
      return createApiJsonResponse(snap.docs.map(d => d.data()));
    }
    if (path === '/cars' && method === 'POST') {
      const id = createNumericId();
      const newCar = { id, ...(body as Omit<Car, 'id'>) };
      await setDoc(doc(db, 'car', String(id)), newCar);
      return createApiJsonResponse(newCar, 201);
    }
    if (path === '/bookings' && method === 'POST') {
      const input = body as Omit<Booking, 'id'>;
      const bookingId = createNumericId();
      const created: Booking = { id: bookingId, ...input, status: input.status === 'completed' ? 'completed' : 'active' };
      await runTransaction(db, async (tx) => {
        const carRef = doc(db, 'car', String(input.carId));
        const carSnap = await tx.get(carRef);
        if (!carSnap.exists()) throw new Error('Car not found');
        const qty = Number((carSnap.data() as Partial<Car>).quantity ?? 0);
        if (qty <= 0) throw new Error('Car is not available');
        tx.update(carRef, { quantity: qty - 1 });
        tx.set(doc(db, 'bookings', String(bookingId)), created);
      });
      return createApiJsonResponse(created, 201);
    }
    if (path === '/messages' && method === 'POST') {
      const id = createNumericId();
      const msg: ChatMessage = {
        id, bookingId: Number((body as Partial<ChatMessage>).bookingId),
        text: String((body as Partial<ChatMessage>).text ?? ''),
        sender: (body as Partial<ChatMessage>).sender === 'admin' ? 'admin' : 'user',
        time: new Date().toISOString(), read: false,
      };
      await setDoc(doc(db, 'messages', String(id)), msg);
      return createApiJsonResponse(msg, 201);
    }
    if (path.startsWith('/cars/') && method === 'PATCH') {
      const id = Number(path.split('/')[2]);
      const ref = doc(db, 'car', String(id));
      await setDoc(ref, body as Partial<Car>, { merge: true });
      return createApiJsonResponse((await getDoc(ref)).data() ?? null);
    }
    if (path.startsWith('/messages/') && method === 'PATCH') {
      const id = Number(path.split('/')[2]);
      const ref = doc(db, 'messages', String(id));
      await setDoc(ref, body as Partial<ChatMessage>, { merge: true });
      return createApiJsonResponse((await getDoc(ref)).data() ?? null);
    }
    if (path.startsWith('/bookings/') && method === 'PATCH') {
      const id = Number(path.split('/')[2]);
      const ref = doc(db, 'bookings', String(id));
      let updated: Booking | null = null;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Booking not found');
        const current = snap.data() as Booking;
        const next = { ...current, ...(body as Partial<Booking>) };
        if (current.status !== 'completed' && (body as Partial<Booking>).status === 'completed') {
          const carRef = doc(db, 'car', String(current.carId));
          const carSnap = await tx.get(carRef);
          if (carSnap.exists()) {
            const qty = Number((carSnap.data() as Partial<Car>).quantity ?? 0);
            tx.update(carRef, { quantity: qty + 1 });
          }
        }
        tx.set(ref, next, { merge: true });
        updated = next;
      });
      return createApiJsonResponse(updated);
    }
    if (path.startsWith('/cars/') && method === 'DELETE') {
      const id = Number(path.split('/')[2]);
      await deleteDoc(doc(db, 'car', String(id)));
      const bSnap = await getDocs(collection(db, 'bookings'));
      const relatedIds = new Set<number>();
      const relatedDocIds: string[] = [];
      bSnap.docs.forEach(d => {
        const bd = d.data() as Partial<Booking>;
        if (Number(bd.carId) === id) { relatedIds.add(Number(bd.id)); relatedDocIds.push(d.id); }
      });
      await Promise.all(relatedDocIds.map(bid => deleteDoc(doc(db, 'bookings', bid))));
      if (relatedIds.size > 0) {
        const mSnap = await getDocs(collection(db, 'messages'));
        const relatedMsgIds: string[] = [];
        mSnap.docs.forEach(d => {
          if (relatedIds.has(Number((d.data() as Partial<ChatMessage>).bookingId))) relatedMsgIds.push(d.id);
        });
        await Promise.all(relatedMsgIds.map(mid => deleteDoc(doc(db, 'messages', mid))));
      }
      return createApiJsonResponse({ success: true });
    }
    return createApiJsonResponse({ message: 'Not found' }, 404);
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    const message = (error as { message?: string }).message ?? 'Internal error';
    return createApiJsonResponse({ message, code }, code.includes('permission-denied') ? 403 : 500);
  }
};

// ══════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════
const Login = ({ onNavigate, onLoginSuccess, onEmailAuth, onSocialAuth }: {
  onNavigate: NavigateFn;
  onLoginSuccess: (email: string, role: Exclude<UserRole, ''>) => void;
  onEmailAuth: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  onSocialAuth: (provider: SocialProvider) => Promise<{ ok: boolean; message?: string }>;
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError('');
    const trimmed = email.trim();
    const result = await onEmailAuth(trimmed, password);
    if (!result.ok) { setError(result.message ?? t('login.authFailed')); setIsLoading(false); return; }
    const role: Exclude<UserRole, ''> = trimmed.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
    onLoginSuccess(trimmed, role);
    onNavigate(role === 'admin' ? 'admin' : 'home');
    setIsLoading(false);
  };

  const handleSocial = async (provider: SocialProvider) => {
    setError(''); setIsLoading(true);
    const result = await onSocialAuth(provider);
    if (result.ok) { onNavigate('home'); } else { setError(result.message ?? t('login.authFailed')); }
    setIsLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-blob login-blob--tl" />
      <div className="login-blob login-blob--br" />
      <div className="login-grid-bg" />

      <div className="login-card">
        <div className="login-card__topline" />
        <div className="login-brand">
          <div className="login-brand__mark">A</div>
          <span className="login-brand__name">Aventus</span>
          <span className="login-brand__dot" />
        </div>
        <h1 className="login-title">{t('login.welcomeBack')}</h1>
        <p className="login-sub">{t('login.subtitle')}</p>

        {error && (
          <div className="login-error">
            <span className="login-error__icon">!</span>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <div className="fl-group">
            <input type="text" id="l-email" placeholder=" " value={email} onChange={e => setEmail(e.target.value)} />
            <label htmlFor="l-email">{t('login.email')}</label>
          </div>
          <div className="fl-group">
            <input type={showPassword ? 'text' : 'password'} id="l-pass" placeholder=" " value={password} onChange={e => setPassword(e.target.value)} />
            <label htmlFor="l-pass">{t('login.password')}</label>
            <button type="button" className="fl-icon fl-icon--btn" onClick={() => setShowPassword(v => !v)}>
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
          <button type="submit" className="login-submit" disabled={isLoading}>
            {isLoading ? <><span className="login-spinner" />{t('login.processing')}</> : <>{t('login.continue')} <span className="login-submit__arrow">→</span></>}
          </button>
        </form>

        <div className="login-divider"><span>{t('login.or')}</span></div>

        <div className="login-socials">
          {ENABLE_GOOGLE_AUTH && (
            <button className="social-btn" onClick={() => handleSocial('google')} disabled={isLoading}>
              <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.4l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c6.9 0 9.6-4.8 9.6-7.3 0-.5-.1-.9-.1-1.3H12z" /></svg>
              {t('login.google')}
            </button>
          )}
          {ENABLE_APPLE_AUTH && (
            <button className="social-btn" onClick={() => handleSocial('apple')} disabled={isLoading}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16.7 12.8c0-2 1.6-3 1.7-3.1-1-.5-2.5-.6-3.5-.2-.9.4-1.6 1.2-2.2 1.2-.6 0-1.5-.8-2.5-.8-1.3 0-2.5.8-3.2 2-.9 1.6-.2 4 1.1 5.8.6.9 1.4 1.9 2.4 1.8 1-.1 1.4-.6 2.6-.6 1.2 0 1.6.6 2.6.6 1.1 0 1.8-.9 2.4-1.8.7-1 1-2 1-2.1-.1 0-2.4-.9-2.4-2.8zM14.6 7.1c.5-.6.9-1.5.8-2.3-.8 0-1.7.5-2.2 1.1-.5.6-.9 1.5-.8 2.3.9.1 1.7-.4 2.2-1.1z" /></svg>
              {t('login.apple')}
            </button>
          )}
          {ENABLE_MICROSOFT_AUTH && (
            <button className="social-btn" onClick={() => handleSocial('microsoft')} disabled={isLoading}>
              <svg width="15" height="15" viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="9" fill="#f25022" /><rect x="13" y="2" width="9" height="9" fill="#7fba00" /><rect x="2" y="13" width="9" height="9" fill="#00a4ef" /><rect x="13" y="13" width="9" height="9" fill="#ffb900" /></svg>
              {t('login.microsoft')}
            </button>
          )}
        </div>
        <p className="login-footer-note">No hidden fees. Drive with confidence.</p>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════
const Navigation = ({ currentPage, onNavigate, userName, userRole, onLogout, themeMode, onToggleTheme }: {
  currentPage: Page; onNavigate: NavigateFn; userName: string;
  userRole: UserRole; onLogout: () => void; themeMode: ThemeMode; onToggleTheme: () => void;
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const isRu = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith('ru');
  const nextLang = isRu ? 'en' : 'ru';

  const navItems: Array<{ label: string; page: Page }> = userRole === 'admin' ? [] : [
    { label: t('nav.home'), page: 'home' },
    { label: t('nav.fleet'), page: 'carpark' },
    { label: t('nav.about'), page: 'about' },
    { label: t('nav.contact'), page: 'contacts' },
  ];

  return (
    <nav className="av-nav">
      <div className="av-nav__inner">
        <div className="av-nav__logo" onClick={() => onNavigate('home')}>
          <div className="av-nav__logo-mark">A</div>
          <span className="av-nav__logo-name">Aventus</span>
          <span className="av-nav__logo-dot" />
        </div>

        <ul className="av-nav__links">
          {navItems.map(item => (
            <li key={item.page}>
              <button className={`av-nav__link${currentPage === item.page ? ' av-nav__link--active' : ''}`} onClick={() => onNavigate(item.page)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="av-nav__actions">
          <button className="av-nav__icon-btn" onClick={() => void i18n.changeLanguage(nextLang)}>{isRu ? 'EN' : 'RU'}</button>
          <button className="av-nav__icon-btn" onClick={onToggleTheme}>{themeMode === 'dark' ? '☀' : '☾'}</button>
          <div className="av-nav__user-chip">
            <span className="av-nav__user-dot" />
            <span className="av-nav__user-role">{userRole === 'admin' ? t('nav.admin') : t('nav.user')}</span>
            <span className="av-nav__user-name">{userName.slice(0, 18)}</span>
          </div>
          <button className="av-nav__logout" onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t('nav.logout')}
          </button>
        </div>

        <button className={`av-nav__burger${isMenuOpen ? ' av-nav__burger--open' : ''}`} onClick={() => setIsMenuOpen(v => !v)}>
          <span /><span /><span />
        </button>
      </div>

      {isMenuOpen && (
        <div className="av-nav__mobile">
          <button className="av-nav__mobile-row" onClick={() => { onToggleTheme(); setIsMenuOpen(false); }}>{themeMode === 'dark' ? '☀ Light' : '☾ Dark'}</button>
          <button className="av-nav__mobile-row" onClick={() => void i18n.changeLanguage(nextLang)}>{isRu ? 'EN' : 'RU'} — Switch language</button>
          {navItems.map(item => (
            <button key={item.page} className={`av-nav__mobile-row${currentPage === item.page ? ' av-nav__mobile-row--active' : ''}`} onClick={() => { onNavigate(item.page); setIsMenuOpen(false); }}>{item.label}</button>
          ))}
          <button className="av-nav__mobile-logout" onClick={onLogout}>{t('nav.logout')}</button>
        </div>
      )}
    </nav>
  );
};

// ══════════════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════════════
const Home = ({ onNavigate }: { onNavigate: NavigateFn }) => {
  const { t } = useTranslation();
  const [scrollY, setScrollY] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-blob hero-blob--top" style={{ transform: `translateY(${scrollY * 0.4}px)` }} />
        <div className="hero-blob hero-blob--bottom" />
        <div className="hero-scanline" />

        <div className="home-wrapper">
          <div className="hero-grid">
            <div className={`hero-left${visible ? ' hero-left--visible' : ''}`}>
              <div className="hero-eyebrow"><span className="hero-eyebrow__dot" />{t('home.badge')}</div>
              <h1 className="hero-h1">
                <span className="hero-h1__stroke">{t('home.title1')}</span>
                <span className="hero-h1__solid">{t('home.title2')}</span>
              </h1>
              <p className="hero-desc">{t('home.desc')}</p>
              <div className="hero-actions">
                <button className="btn-primary" onClick={() => onNavigate('carpark')}>{t('home.browse')} <span className="btn-arrow">→</span></button>
                <button className="btn-ghost" onClick={() => onNavigate('contacts')}>{t('home.contact')}</button>
              </div>
              <div className="hero-stats">
                <div className="hero-stat"><span className="hero-stat__num">250+</span><span className="hero-stat__lbl">{t('home.carsAvailable')}</span></div>
                <div className="hero-stat__divider" />
                <div className="hero-stat"><span className="hero-stat__num">4.9</span><span className="hero-stat__lbl">{t('home.clientRating')}</span></div>
                <div className="hero-stat__divider" />
                <div className="hero-stat"><span className="hero-stat__num">24/7</span><span className="hero-stat__lbl">Support</span></div>
              </div>
            </div>

            <div className={`hero-right${visible ? ' hero-right--visible' : ''}`}>
              <div className="hero-card">
                <div className="hero-card__glow" />
                <div className="hero-card__img-wrap">
                  <img src="https://images.unsplash.com/photo-1617788138017-80ad40651399?w=800&q=80" alt="Featured car" className="hero-card__img" />
                  <div className="hero-card__img-overlay" />
                  <div className="hero-card__live-badge"><span className="hero-card__live-dot" />Live availability</div>
                </div>
                <div className="hero-card__body">
                  <div className="hero-card__name-row">
                    <div><p className="hero-card__model">VW Arteon</p><p className="hero-card__sub">{t('home.featured')}</p></div>
                    <div className="hero-card__rating"><span className="hero-card__star">★</span>4.9</div>
                  </div>
                  <div className="hero-card__divider" />
                  <div className="hero-card__meta">
                    {[{ val: 'EUR 120', lbl: 'per day' }, { val: '5', lbl: 'available' }, { val: 'Full', lbl: 'insurance' }].map(m => (
                      <div key={m.lbl} className="hero-card__meta-item">
                        <span className="hero-card__meta-val">{m.val}</span>
                        <span className="hero-card__meta-lbl">{m.lbl}</span>
                      </div>
                    ))}
                  </div>
                  <button className="hero-card__cta" onClick={() => onNavigate('carpark')}>Browse all cars →</button>
                </div>
              </div>
              <div className="hero-chip hero-chip--tl"><span className="hero-chip__dot" />Instant booking</div>
              <div className="hero-chip hero-chip--br">🛡 Full coverage</div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-features">
        <div className="home-wrapper">
          <div className="features-grid">
            {[
              { icon: '⚡', title: 'Instant Confirmation', desc: 'Book in under 2 minutes. No waiting, no paperwork.' },
              { icon: '🛡', title: 'Full Insurance', desc: 'Liability, damage, theft & roadside assistance included.' },
              { icon: '💬', title: 'Direct Admin Chat', desc: 'Message our team directly after booking anytime.' },
              { icon: '🔑', title: 'Easy Returns', desc: 'Multiple drop-off locations across Bulgaria.' },
            ].map((f, i) => (
              <div key={i} className="feature-card" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="feature-card__icon">{f.icon}</div>
                <h3 className="feature-card__title">{f.title}</h3>
                <p className="feature-card__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// CAR PARK
// ══════════════════════════════════════════════════════════
const CarPark = ({ onNavigate, cars }: { onNavigate: NavigateFn; cars: Car[] }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const norm = searchTerm.trim().toLowerCase();
  const available = cars.filter(c => c.quantity > 0);
  const totalUnits = available.reduce((s, c) => s + c.quantity, 0);
  const filtered = available.filter(c => !norm || c.name.toLowerCase().includes(norm) || c.price.toLowerCase().includes(norm) || c.features.some(f => f.toLowerCase().includes(norm)));

  return (
    <div className="carpark-page">
      <div className="carpark-wrapper">
        <div className="carpark-header">
          <span className="carpark-eyebrow">// {t('carpark.title')}</span>
          <h1 className="carpark-title">{t('carpark.title')}</h1>
          <p className="carpark-sub">{available.length} models · {totalUnits} {t('home.carsAvailable')}</p>
          <div className="carpark-search-wrap">
            <svg className="carpark-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={t('carpark.searchPlaceholder')} className="carpark-search-input" />
            {searchTerm && <button className="carpark-search-clear" onClick={() => setSearchTerm('')}>✕</button>}
          </div>
          {searchTerm.trim() && <p className="carpark-search-hint">{filtered.length} result(s) for "{searchTerm.trim()}"</p>}
        </div>

        {cars.length === 0 && <div className="carpark-empty"><div className="carpark-empty__icon">🚗</div><p>{t('carpark.noCars')}</p></div>}
        {cars.length > 0 && available.length === 0 && <div className="carpark-empty"><div className="carpark-empty__icon">📋</div><p>{t('carpark.allBooked')}</p></div>}
        {filtered.length === 0 && searchTerm.trim() && available.length > 0 && (
          <div className="carpark-empty">
            <div className="carpark-empty__icon">🔍</div>
            <p>{t('carpark.noMatch')}</p>
            <button className="carpark-clear-btn" onClick={() => setSearchTerm('')}>{t('carpark.clearSearch')}</button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="carpark-grid">
            {filtered.map((car, idx) => (
              <div key={car.id} className="cp-card" style={{ animationDelay: `${idx * 0.07}s` }} onClick={() => onNavigate('cardetail', car.id)}>
                <div className="cp-card__img-wrap">
                  <img src={getPrimaryCarImage(car)} alt={car.name} className="cp-card__img" onError={e => { (e.target as HTMLImageElement).src = DEFAULT_CAR_IMAGE; }} />
                  <div className="cp-card__img-overlay" />
                  <div className="cp-card__avail-badge"><span className="cp-card__avail-dot" />{car.quantity} avail</div>
                </div>
                <div className="cp-card__body">
                  <h3 className="cp-card__name">{car.name}</h3>
                  <div className="cp-card__meta"><span className="cp-card__rating"><span className="cp-card__star">★</span>{car.rating}</span></div>
                  <div className="cp-card__pills">
                    {car.features.slice(0, 3).map(f => <span key={f} className="cp-card__pill">{f}</span>)}
                    {car.features.length > 3 && <span className="cp-card__pill cp-card__pill--more">+{car.features.length - 3}</span>}
                  </div>
                  <div className="cp-card__footer">
                    <div><span className="cp-card__price">{car.price}</span><span className="cp-card__per-day">/day</span></div>
                    <button className="cp-card__btn" onClick={e => { e.stopPropagation(); onNavigate('cardetail', car.id); }}>{t('carpark.bookNow')} →</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// ABOUT
// ══════════════════════════════════════════════════════════
const About = () => {
  const { t } = useTranslation();
  return (
    <div className="about-page">
      <div className="ac-wrapper">
        <span className="ac-eyebrow">// {t('about.title')}</span>
        <h1 className="ac-title">{t('about.title')}</h1>
        <div className="about-card">
          <div className="about-card__topline" />
          {[
            'Our platform was built to simplify the full car rental workflow for both customers and administrators.',
            'On the customer side, users can explore available vehicles, view detailed car information, and submit a reservation quickly with transparent pricing and clear booking details.',
            'On the admin side, the platform helps manage fleet inventory, bookings, and customer communication in one place.',
            'The main goal of this project is to provide a reliable, user-friendly rental management experience that is easy to operate, easy to extend, and ready for real-world daily use.',
          ].map((text, i) => <p key={i} className="about-card__p">{text}</p>)}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════════════════════════
const Contacts = () => {
  const { t } = useTranslation();
  const offices = [
    { city: 'Sofia', addr: 'Aleksandar Malinov Blvd 37', phone: '+359 898 636 246' },
    { city: 'Plovdiv', addr: 'Kulensko Shose Blvd 20', phone: '+359 898 636 246' },
    { city: 'Stara Zagora', addr: 'Tsar Simeon Veliki St. 83', phone: '+359 898 636 246' },
    { city: 'Plovdiv Airport', addr: 'Airport Terminal', phone: '+359 898 636 246' },
  ];
  return (
    <div className="contacts-page">
      <div className="ac-wrapper">
        <div className="contacts-header">
          <span className="ac-eyebrow">// {t('contacts.title')}</span>
          <h1 className="ac-title">{t('contacts.title')}</h1>
          <p className="contacts-sub">{t('contacts.subtitle')}</p>
        </div>
        <div className="contacts-grid">
          {offices.map((o, i) => (
            <div key={i} className="office-card" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="office-card__topline" />
              <h3 className="office-card__city">{o.city}</h3>
              <div className="office-card__rows">
                <div className="office-card__row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  <span>{o.addr}</span>
                </div>
                <div className="office-card__row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.6 4.36 2 2 0 0 1 3.57 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.09 6.09l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  <a href={`tel:${o.phone}`} className="office-card__phone">{o.phone}</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// ADMIN PANEL
const AdminPanel = ({
  cars,
  bookings,
  messages,
  onOpenChat,
}: {
  cars: Car[];
  bookings: Booking[];
  messages: ChatMessage[];
  onOpenChat: (booking: Booking) => void;
}) => {
  const totalUnits = cars.reduce((sum, car) => sum + Math.max(0, Number(car.quantity) || 0), 0);
  const activeBookings = bookings.filter(b => b.status === 'active');
  const completedBookings = bookings.filter(b => b.status === 'completed');
  const unreadMessages = messages.filter(m => m.sender === 'user' && !m.read).length;

  const unreadByBooking = new Map<number, number>();
  messages.forEach((m) => {
    if (m.sender !== 'user' || m.read) return;
    unreadByBooking.set(m.bookingId, (unreadByBooking.get(m.bookingId) ?? 0) + 1);
  });

  const recentMessages = [...messages].slice(-10).reverse();
  const formatMessageTime = (value: string) => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : value;
  };

  return (
    <div className="admin-page">
      <div className="home-wrapper">
        <div className="section-header">
          <div>
            <span className="carpark-eyebrow">// Admin</span>
            <h1 className="carpark-title">Admin panel</h1>
            <p className="carpark-sub">Manage cars, bookings, and messages</p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat__num">{cars.length}</span>
              <span className="hero-stat__lbl">Models</span>
            </div>
            <div className="hero-stat__divider" />
            <div className="hero-stat">
              <span className="hero-stat__num">{totalUnits}</span>
              <span className="hero-stat__lbl">Units</span>
            </div>
            <div className="hero-stat__divider" />
            <div className="hero-stat">
              <span className="hero-stat__num">{unreadMessages}</span>
              <span className="hero-stat__lbl">Unread</span>
            </div>
          </div>
        </div>

        <div className="section-header">
          <div>
            <span className="carpark-eyebrow">// Cars</span>
            <h2 className="carpark-title">Fleet</h2>
            <p className="carpark-sub">{cars.length} models � {totalUnits} total units</p>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Price</th>
              <th>Rating</th>
              <th>Units</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            {cars.length === 0 && (
              <tr>
                <td colSpan={5}>No cars yet.</td>
              </tr>
            )}
            {cars.map(car => (
              <tr key={car.id}>
                <td>{car.name}</td>
                <td>{car.price}</td>
                <td>{car.rating}</td>
                <td>{car.quantity}</td>
                <td>{car.features.slice(0, 3).join(', ') || '�'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="section-header" style={{ marginTop: 40 }}>
          <div>
            <span className="carpark-eyebrow">// Bookings</span>
            <h2 className="carpark-title">Bookings</h2>
            <p className="carpark-sub">
              {activeBookings.length} active � {completedBookings.length} completed
            </p>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Car</th>
              <th>User</th>
              <th>Pickup</th>
              <th>Return</th>
              <th>Status</th>
              <th>Chat</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr>
                <td colSpan={7}>No bookings yet.</td>
              </tr>
            )}
            {bookings.map(booking => {
              const unreadCount = unreadByBooking.get(booking.id) ?? 0;
              return (
                <tr key={booking.id}>
                  <td>#{booking.id}</td>
                  <td>{booking.carName}</td>
                  <td>{booking.userName}</td>
                  <td>{booking.pickupDate}</td>
                  <td>{booking.returnDate}{booking.returnTime ? ` ${booking.returnTime}` : ''}</td>
                  <td>
                    <span className={`badge ${booking.status === 'active' ? 'badge-active' : 'badge-completed'}`}>
                      {booking.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn-ghost" onClick={() => onOpenChat(booking)}>
                      Open chat{unreadCount ? ` (${unreadCount})` : ''}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="section-header" style={{ marginTop: 40 }}>
          <div>
            <span className="carpark-eyebrow">// Messages</span>
            <h2 className="carpark-title">Recent messages</h2>
            <p className="carpark-sub">Last 10 conversations</p>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Booking</th>
              <th>Sender</th>
              <th>Text</th>
              <th>Time</th>
              <th>Read</th>
            </tr>
          </thead>
          <tbody>
            {recentMessages.length === 0 && (
              <tr>
                <td colSpan={6}>No messages yet.</td>
              </tr>
            )}
            {recentMessages.map(msg => (
              <tr key={msg.id}>
                <td>#{msg.id}</td>
                <td>#{msg.bookingId}</td>
                <td>{msg.sender}</td>
                <td>{msg.text}</td>
                <td>{formatMessageTime(msg.time)}</td>
                <td>{msg.read ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
// CHAT MODAL
// ══════════════════════════════════════════════════════════
const ChatModal = ({ booking, onClose, onSendMessage, messages }: {
  booking: Booking; onClose: () => void;
  onSendMessage: SendMessageFn; messages: ChatMessage[];
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [onClose]);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    const ok = await onSendMessage(booking.id, message);
    if (ok) setMessage('');
    setIsSending(false);
  };

  const bookingMessages = messages.filter(m => m.bookingId === booking.id);

  return (
    <div className="chat-overlay" onMouseDown={onClose}>
      <div className="chat-modal" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
        <div className="chat-modal__header">
          <div className="chat-modal__header-topline" />
          <div>
            <h2 className="chat-modal__title">{booking.carName}</h2>
            <p className="chat-modal__sub">Booking #{booking.id} · Chat with admin</p>
          </div>
          <button className="chat-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="chat-modal__body">
          {bookingMessages.length === 0
            ? <div className="chat-modal__empty"><p>💬</p><p>{t('chat.noMessages')}</p></div>
            : bookingMessages.map(msg => (
              <div key={msg.id} className={`chat-msg chat-msg--${msg.sender}`}>
                <div className={`chat-bubble chat-bubble--${msg.sender}`}>
                  <p className="chat-bubble__sender">{msg.sender === 'user' ? 'You' : 'Admin'}</p>
                  <p className="chat-bubble__text">{msg.text}</p>
                  <p className="chat-bubble__time">{msg.time}</p>
                </div>
              </div>
            ))
          }
          <div ref={endRef} />
        </div>
        <div className="chat-modal__footer">
          <input type="text" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} disabled={isSending} placeholder={t('chat.typeMessage')} className="chat-modal__input" />
          <button className="chat-modal__send" onClick={handleSend} disabled={isSending || !message.trim()}>
            {isSending ? <span className="chat-send-spinner" /> : '→'}
            {isSending ? t('chat.sending') : t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// NOT FOUND
// ══════════════════════════════════════════════════════════
const NotFound = ({ onNavigate }: { onNavigate?: NavigateFn }) => {
  const handleHome = () => {
    if (onNavigate) onNavigate('home');
    else window.location.href = '/';
  };
  return (
    <div className="notfound-page">
      <div className="notfound-blob notfound-blob--tl" />
      <div className="notfound-blob notfound-blob--br" />
      <div className="notfound-grid" />
      <div className="notfound-card">
        <div className="notfound-card__topline" />
        <div className="notfound-logo">
          <div className="notfound-logo__mark">A</div>
          <div className="notfound-logo__ring" />
        </div>
        <p className="notfound-eyebrow">Aventus</p>
        <h1 className="notfound-code">404</h1>
        <div className="notfound-glitch">
          <span>PAGE_NOT_FOUND</span>
          <span aria-hidden>PAGE_NOT_FOUND</span>
        </div>
        <p className="notfound-title">Sahifa topilmadi</p>
        <p className="notfound-desc">Siz qidirgan sahifa mavjud emas yoki manzil o'zgargan bo'lishi mumkin.</p>
        <div className="notfound-actions">
          <button className="notfound-btn-primary" onClick={handleHome}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Bosh sahifaga qaytish
          </button>
          <button className="notfound-btn-ghost" onClick={() => window.history.back()}>← Orqaga</button>
        </div>
        <p className="notfound-note">// error 404 · page not found</p>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════
const DLRentApp = () => {
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });
  const [cars, setCars] = useState<Car[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [pageKey, setPageKey] = useState(0);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const autoReturnRef = useRef(false);
  const [authToken, setAuthToken] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    document.documentElement.dataset.theme = themeMode;
    document.body.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setBookings([]); setMessages([]); return; }
      try {
        const [bRes, mRes] = await Promise.all([apiFetch(`${API_URL}/bookings`), apiFetch(`${API_URL}/messages`)]);
        if (!bRes.ok || !mRes.ok) throw new Error('Failed');
        const rawB = (await bRes.json()) as unknown[];
        const rawM = (await mRes.json()) as unknown[];
        setBookings(rawB.filter((b): b is Partial<Booking> =>
          typeof b === 'object' && b !== null &&
          typeof (b as Partial<Booking>).id === 'number'
        ).map(b => ({ ...b, status: b.status === 'completed' ? 'completed' : 'active' } as Booking)));
        setMessages(rawM.filter((m): m is ChatMessage =>
          typeof m === 'object' && m !== null &&
          typeof (m as ChatMessage).id === 'number' &&
          ((m as ChatMessage).sender === 'user' || (m as ChatMessage).sender === 'admin')
        ));
      } catch (e) { console.error(e); }
    };
    void load();
  }, [authToken]);

  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) { setUserName(''); setUserRole(''); setCurrentPage('login'); return; }
        const parsed = JSON.parse(raw) as Partial<StoredAuth>;
        if (parsed.userRole === 'admin' || parsed.userRole === 'user') {
          setUserRole(parsed.userRole); setUserName(parsed.userName ?? '');
          setCurrentPage(parsed.userRole === 'admin' ? 'admin' : 'home');
        } else { setUserName(''); setUserRole(''); setCurrentPage('login'); }
      } catch { /* ignore */ }
    };
    const onStorage = (e: StorageEvent) => { if (e.key === AUTH_STORAGE_KEY) sync(); };
    sync();
    window.addEventListener('storage', onStorage);
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(AUTH_CHANGE_EVENT, sync); };
  }, []);

  useEffect(() => { void getRedirectResult(auth).catch(console.error); }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      if (!user) {
        setUserName(''); setUserRole(''); setCurrentPage('login');
        localStorage.removeItem(AUTH_STORAGE_KEY);
        window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
        setAuthToken(p => p + 1); return;
      }
      const email = user.email ?? user.displayName ?? '';
      if (!email) { setUserName(''); setUserRole(''); setCurrentPage('login'); localStorage.removeItem(AUTH_STORAGE_KEY); window.dispatchEvent(new Event(AUTH_CHANGE_EVENT)); setAuthToken(p => p + 1); return; }
      const role: Exclude<UserRole, ''> = email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
      setUserName(email); setUserRole(role);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ userName: email, userRole: role } satisfies StoredAuth));
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
      setCurrentPage(p => p === 'login' ? (role === 'admin' ? 'admin' : 'home') : p);
      setAuthToken(p => p + 1);
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      setCarsLoading(true);
      try {
        const res = await apiFetch(`${API_URL}/cars`);
        if (!res.ok) return;
        const data = (await res.json()) as unknown[];
        setCars(data.map(r => {
          const t = r as Partial<Car>;
          if (typeof t.id !== 'number') return null;
          return { ...t, id: t.id, imageGallery: t.imageGallery ?? [DEFAULT_CAR_IMAGE], quantity: Math.max(0, Math.floor(Number(t.quantity ?? 1))) } as Car;
        }).filter(Boolean) as Car[]);
      } catch (e) { console.error(e); }
      finally { setCarsLoading(false); }
    };
    void load();
  }, [authToken]);

  useEffect(() => {
    const autoComplete = async () => {
      if (autoReturnRef.current) return;
      const expired = bookings.filter(b => b.status === 'active' && Date.now() >= getBookingReturnAtMs(b));
      if (!expired.length) return;
      autoReturnRef.current = true;
      try {
        const results = await Promise.allSettled(expired.map(b => apiFetch(`${API_URL}/bookings/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) })));
        const doneIds = new Set(results.map((r, i) => r.status === 'fulfilled' ? expired[i].id : null).filter(Boolean) as number[]);
        if (doneIds.size) setBookings(p => p.map(b => doneIds.has(b.id) ? { ...b, status: 'completed' } : b));
      } finally { autoReturnRef.current = false; }
    };
    void autoComplete();
    const id = window.setInterval(() => void autoComplete(), 60_000);
    return () => window.clearInterval(id);
  }, [bookings]);

  const handleNavigate: NavigateFn = (page, carId = null) => {
    if (carId !== null) setSelectedCarId(carId);
    setCurrentPage(page);
    setPageKey(k => k + 1);
    window.scrollTo(0, 0);
  };

  const handleLoginSuccess = (email: string, role: Exclude<UserRole, ''>) => {
    setUserName(email); setUserRole(role);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ userName: email, userRole: role } satisfies StoredAuth));
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  };

  const handleEmailAuth = async (email: string, password: string) => {
    if (!email.trim() || !password) return { ok: false, message: 'Email and password are required.' };
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { ok: true };
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        try { await createUserWithEmailAndPassword(auth, email.trim(), password); return { ok: true }; }
        catch (ce: unknown) {
          if ((ce as { code?: string }).code === 'auth/email-already-in-use') return { ok: false, message: 'Incorrect password.' };
          return { ok: false, message: 'Registration failed.' };
        }
      }
      if (code === 'auth/wrong-password') return { ok: false, message: 'Incorrect password.' };
      return { ok: false, message: 'Login failed.' };
    }
  };

  const handleSocialAuth = async (provider: SocialProvider) => {
    try {
      const fp = provider === 'apple' ? appleProvider : provider === 'microsoft' ? microsoftProvider : googleProvider;
      if (isMobileAuthEnvironment()) { await signInWithRedirect(auth, fp); return { ok: true }; }
      const result = await signInWithPopup(auth, fp);
      handleLoginSuccess(result.user.email ?? result.user.displayName ?? 'social-user', 'user');
      return { ok: true };
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
        try { await signInWithRedirect(auth, provider === 'apple' ? appleProvider : provider === 'microsoft' ? microsoftProvider : googleProvider); return { ok: true }; } catch { /* ignore */ }
      }
      return { ok: false, message: `${provider} sign-in failed.` };
    }
  };

  const handleLogout = () => {
    setCurrentPage('login'); setUserName(''); setUserRole('');
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    void signOut(auth).catch(console.error);
  };

  const handleSendMessage: SendMessageFn = async (bookingId, text, sender = 'user') => {
    if (!auth.currentUser || !text.trim()) return false;
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return false;
    if (sender === 'user' && booking.userName !== userName) return false;
    try {
      const res = await apiFetch(`${API_URL}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId, text, sender }) });
      if (!res.ok) return false;
      const createdMessage = (await res.json()) as ChatMessage;
      setMessages(p => [...p, createdMessage]);
      return true;
    } catch { return false; }
  };

  return (
    <div className={`app-shell ${themeMode === 'light' ? 'theme-light' : 'theme-dark'}`}>
      {currentPage !== 'login' && (
        <Navigation
          currentPage={currentPage} onNavigate={handleNavigate}
          userName={userName} userRole={userRole} onLogout={handleLogout}
          themeMode={themeMode} onToggleTheme={() => setThemeMode(p => p === 'dark' ? 'light' : 'dark')}
        />
      )}

      {currentPage === 'login' && <Login onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} onEmailAuth={handleEmailAuth} onSocialAuth={handleSocialAuth} />}

      <div key={pageKey} className="page-transition-wrapper">
        {currentPage === 'home' && <Home onNavigate={handleNavigate} />}
        {currentPage === 'carpark' && (
          carsLoading
            ? (
              <div className="carpark-page">
                <div className="carpark-wrapper">
                  <div className="skeleton-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton-card">
                        <div className="skeleton skeleton-img" />
                        <div className="skeleton-body">
                          <div className="skeleton skeleton-title" />
                          <div className="skeleton skeleton-meta" />
                          <div className="skeleton-pills">
                            <div className="skeleton skeleton-pill" style={{ width: 60 }} />
                            <div className="skeleton skeleton-pill" style={{ width: 80 }} />
                            <div className="skeleton skeleton-pill" style={{ width: 50 }} />
                          </div>
                          <div className="skeleton-footer">
                            <div className="skeleton skeleton-price" />
                            <div className="skeleton skeleton-btn" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
            : <CarPark onNavigate={handleNavigate} cars={cars} />
        )}
        {currentPage === 'about' && <About />}
        {currentPage === 'contacts' && <Contacts />}
        {currentPage === 'cardetail' && (
          <div className="page-placeholder">
            <p>CarDetail — подключить отдельно</p>
            {selectedCarId !== null && <p>Selected car ID: {selectedCarId}</p>}
          </div>
        )}
        {currentPage === 'admin' && (
  <AdminPanel
    cars={cars}
    bookings={bookings}
    messages={messages}
    onOpenChat={(booking) => setSelectedBooking(booking)}
  />
)}
        {currentPage === 'notfound' as Page && <NotFound onNavigate={handleNavigate} />}
      </div>

      {selectedBooking && userRole === 'admin' && (
        <ChatModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} onSendMessage={handleSendMessage} messages={messages} />
      )}
    </div>
  );
};

export default DLRentApp;

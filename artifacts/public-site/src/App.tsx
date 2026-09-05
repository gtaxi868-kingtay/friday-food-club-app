import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ConvexProvider, ConvexReactClient, useQuery } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import whiteLogo from '../../portal/src/assets/logo-white.png';
import goldLogo from '../../portal/src/assets/logo-gold.png';
import heroScene from '@assets/IMG_2024_1787148750238.PNG';
import coinScene from '@assets/IMG_2025_1787148750238.PNG';
import pathwayScene from '@assets/IMG_2027_1787148750238.PNG';

const queryClient = new QueryClient();

type ModalType = 'member' | 'chef' | 'drop' | null;

type PublicDrop = {
  id: string;
  label: string;
  status: string;
  title: string;
  description: string;
  details: string;
  price: string;
  className: string;
};

const drops: PublicDrop[] = [
  {
    id: '04',
    label: 'This Friday / 6:30 PM',
    status: 'Preorder open',
    title: 'The Sunday Lunch Edit',
    description: 'Slow-roasted pork, green-seasoning rice and the gravy everyone asks about.',
    details: 'A ten-plate collaboration from Chef Kiran and The Lunchroom. Pick-up in Port of Spain.',
    price: 'From TT$145',
    className: 'drop-card-feature',
  },
  {
    id: '05',
    label: 'Next Friday / 5:00 PM',
    status: 'Members first',
    title: 'Doubles, Proper',
    description: 'A little messy. Completely worth it.',
    details: 'Chef Nia is doing her version of the Trinidad classic with bara made fresh that morning.',
    price: 'From TT$48',
    className: '',
  },
  {
    id: '06',
    label: 'Coming soon',
    status: 'Notify me',
    title: 'After Dark',
    description: 'Small plates for a long night.',
    details: 'A late-night tasting menu is being kept under wraps. Club members get the first hint.',
    price: 'Details soon',
    className: '',
  },
];

function LiveDropGrid({ onOpen }: { onOpen: (drop: PublicDrop) => void }) {
  const liveDrops = useQuery(api.drops.list, { status: 'ACTIVE' });

  if (liveDrops === undefined) {
    return (
      <div className="live-drop-state" role="status">
        <span className="eyebrow">Finding the signal</span>
        <p>Checking what is being plated this Friday…</p>
      </div>
    );
  }

  if (liveDrops.length === 0) {
    return (
      <div className="live-drop-state">
        <span className="eyebrow">The kitchen is quiet</span>
        <p>No open drops right now. Join the Friday note and we’ll send the next one.</p>
      </div>
    );
  }

  return (
    <div className="drop-grid">
      {liveDrops.slice(0, 6).map((drop: any, index: number) => {
        const publicDrop: PublicDrop = {
          id: String(drop._id).slice(-2).padStart(2, '0'),
          label: `${drop.mealSlot ?? 'This Friday'} / ${drop.pickupLocation ?? 'Port of Spain'}`,
          status: drop.remaining === 0 ? 'Sold out' : 'Preorder open',
          title: drop.title,
          description: drop.description,
          details: `${drop.description} Pick-up at ${drop.pickupLocation}.`,
          price: `From TT$${drop.price}`,
          className: index === 0 ? 'drop-card-feature' : '',
        };
        return (
          <button
            className={`drop-card ${publicDrop.className}`}
            key={drop._id}
            type="button"
            data-testid={`button-live-drop-${publicDrop.id}`}
            onClick={() => onOpen(publicDrop)}
          >
            <span className="drop-overlay" />
            <span className="drop-top">
              <span className="eyebrow">{publicDrop.label}</span>
              <span className="drop-status">{publicDrop.status}</span>
            </span>
            <span className="drop-bottom">
              <span>
                <span className="eyebrow">Drop no. {publicDrop.id}</span>
                <h3>{publicDrop.title}</h3>
                <p>{publicDrop.description}</p>
              </span>
              <span className="drop-arrow" aria-hidden="true">↗</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Home({ liveDropsEnabled }: { liveDropsEnabled: boolean }) {
  const [modal, setModal] = useState<ModalType>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [coinSpin, setCoinSpin] = useState(0);
  const [coinMode, setCoinMode] = useState<'membership' | 'pathway'>('membership');
  const [formMessage, setFormMessage] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [selectedDrop, setSelectedDrop] = useState<PublicDrop>(drops[0]);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = 'Friday Food Club — Good food. Good people. Exclusive access.';
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute(
        'content',
        'Chef-made food drops, secret menus and first access for the Friday Food Club in Trinidad and Tobago.',
      );
    }
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = hero.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      hero.style.setProperty('--pointer-x', `${Math.max(-1, Math.min(1, x))}`);
      hero.style.setProperty('--pointer-y', `${Math.max(-1, Math.min(1, y))}`);
    };
    const resetPointer = () => {
      hero.style.setProperty('--pointer-x', '0');
      hero.style.setProperty('--pointer-y', '0');
    };

    hero.addEventListener('pointermove', handlePointerMove);
    hero.addEventListener('pointerleave', resetPointer);
    return () => {
      hero.removeEventListener('pointermove', handlePointerMove);
      hero.removeEventListener('pointerleave', resetPointer);
    };
  }, []);

  const triggerCoinSpin = () => {
    setCoinMode((mode) => mode === 'membership' ? 'pathway' : 'membership');
    setCoinSpin((spin) => spin + 1);
  };

  const closeModal = () => {
    setModal(null);
    setModalMessage('');
  };

  const handleClubSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('You are on the list. Watch your inbox for the next whisper.');
    event.currentTarget.reset();
  };

  const handleModalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalMessage(
      modal === 'chef'
        ? 'Your note is in. We will be in touch with the next step.'
        : 'You are in the circle. The next drop will find you.',
    );
    event.currentTarget.reset();
  };

  const openDrop = (drop: PublicDrop) => {
    setSelectedDrop(drop);
    setModal('drop');
  };

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="site-shell">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <a className="brand-lockup" href="#top" data-testid="link-brand-home" onClick={() => setMobileOpen(false)}>
          <img src={whiteLogo} alt="Friday Food Club" />
          <span className="brand-wordmark">
            <strong>Friday</strong>
            <span>Food Club</span>
          </span>
        </a>
        <nav className={`nav-links ${mobileOpen ? 'mobile-visible' : ''}`} aria-label="Main navigation">
          <a href="#drops" data-testid="link-nav-drops" onClick={() => setMobileOpen(false)}>Secret Drops</a>
          <a href="#how-it-works" data-testid="link-nav-how" onClick={() => setMobileOpen(false)}>How it works</a>
          <a href="#chefs" data-testid="link-nav-chefs" onClick={() => setMobileOpen(false)}>For chefs</a>
        </nav>
        <div className="top-actions">
          <button className="text-link" type="button" data-testid="button-member-login" onClick={() => setModal('member')}>Member access</button>
          <button className="outline-button" type="button" data-testid="button-join-club-top" onClick={() => setModal('member')}>Join the club</button>
        </div>
        <button
          className="mobile-toggle"
          type="button"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          data-testid="button-mobile-menu"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? 'Close' : 'Menu'}
        </button>
      </header>

      <main>
        <section className="hero" id="top" aria-labelledby="hero-title" ref={heroRef}>
          <div className="hero-inner section-pad">
            <div className="hero-copy">
              <div className="hero-kicker eyebrow">Trinidad &amp; Tobago / Est. 2023</div>
              <h1 className="hero-title display" id="hero-title">
                Good food
                <em>finds you.</em>
              </h1>
              <p className="hero-dek">
                Friday Food Club is the little secret between you and the best thing a local chef is making this week.
              </p>
              <div className="hero-ctas">
                <button className="gold-button" type="button" data-testid="button-see-drops-hero" onClick={() => scrollTo('drops')}>
                  See the next drop
                </button>
                <span className="hero-note"><span className="pulse-dot" /> Fresh menus, every Friday</span>
              </div>
            </div>
            <div className="hero-art" aria-label="The Friday Food Club membership coin">
              <div className="art-orbit" />
              <div className="hero-scene-wrap" aria-hidden="true">
                <img className="hero-scene" src={heroScene} alt="" />
              </div>
              <div className="hero-coin-shadow" aria-hidden="true" />
              <button
                className={`hero-coin ${coinMode === 'pathway' ? 'hero-coin-pathway' : ''}`}
                type="button"
                aria-label="Spin the Friday Food Club membership coin"
                onClick={triggerCoinSpin}
                key={coinSpin}
              >
                <span className="coin-edge" />
                <img src={coinScene} alt="" />
                <span className="coin-glint" />
              </button>
              <div className="hero-pathway-peek" aria-hidden="true">
                <img src={pathwayScene} alt="" />
              </div>
              <div className="coin-instruction">
                <span className="eyebrow">Tap the coin</span>
                <span>{coinMode === 'membership' ? 'Carry the club with you.' : 'Find your next pathway.'}</span>
              </div>
              <div className="art-tag tag-one">
                <span className="eyebrow">Drop no. 04</span>
                <p>Made for<br />sharing.</p>
              </div>
              <div className="art-tag tag-two">
                <span className="eyebrow">Port of Spain</span>
                <p>Pick-up<br />Friday.</p>
              </div>
            </div>
          </div>
          <a className="hero-scroll" href="#story" data-testid="link-scroll-story">
            <span className="scroll-line" />
            <span>Follow the flavour</span>
          </a>
        </section>

        <div className="ticker-wrap" aria-label="Friday Food Club highlights">
          <div className="ticker">
            <span>Chef-led menus</span><span>Limited portions</span><span>Preorder access</span><span>Good people</span>
            <span>Chef-led menus</span><span>Limited portions</span><span>Preorder access</span><span>Good people</span>
          </div>
        </div>

        <section className="intro section-pad" id="story" aria-labelledby="story-title">
          <div className="intro-grid">
            <div>
              <div className="intro-label eyebrow">Not a food app</div>
              <h2 className="intro-title display" id="story-title">A table<br />with <em>secrets.</em></h2>
            </div>
            <div className="intro-body">
              <p>Every week, a chef cooks something they cannot stop thinking about. We find it, give it a name, and save you a seat.</p>
              <small>
                No endless scrolling. No restaurant roulette. Just a short list of brilliant things, made in small batches by people who care about the last bite.
              </small>
            </div>
          </div>
          <div className="rule" />
          <div className="manifesto">
            <article><strong>01 / The invite</strong><p>Discover the drop before the crowd does.</p></article>
            <article><strong>02 / The maker</strong><p>Meet the hands and stories behind your plate.</p></article>
            <article><strong>03 / The ritual</strong><p>Friday tastes better when it is shared.</p></article>
          </div>
        </section>

        <section className="drops section-pad" id="drops" aria-labelledby="drops-title">
          <div className="drops-head">
            <div>
              <div className="drops-label eyebrow">The weekly edit / June 2025</div>
              <h2 className="drops-title display" id="drops-title">Open the<br /><em>secret.</em></h2>
            </div>
            <p className="drops-sub">Small menus. Big feelings. Tap a card to see what is being plated next.</p>
          </div>
          {liveDropsEnabled ? (
            <LiveDropGrid onOpen={openDrop} />
          ) : (
            <div className="drop-grid">
              {drops.map((drop) => (
              <button
                className={`drop-card ${drop.className}`}
                key={drop.id}
                type="button"
                data-testid={`button-drop-${drop.id}`}
                onClick={() => openDrop(drop)}
              >
                <span className="drop-overlay" />
                <span className="drop-top">
                  <span className="eyebrow">{drop.label}</span>
                  <span className="drop-status">{drop.status}</span>
                </span>
                <span className="drop-bottom">
                  <span>
                    <span className="eyebrow">Drop no. {drop.id}</span>
                    <h3>{drop.title}</h3>
                    <p>{drop.description}</p>
                  </span>
                  <span className="drop-arrow" aria-hidden="true">↗</span>
                </span>
              </button>
              ))}
            </div>
          )}
          <div className="drop-footer">
            <span className="mono">Menus move quickly. Portions do not.</span>
            <button className="outline-button" type="button" data-testid="button-notify-drops" onClick={() => setModal('member')}>Get the Friday note</button>
          </div>
        </section>

        <section className="how section-pad" id="how-it-works" aria-labelledby="how-title">
          <div className="how-grid">
            <div>
              <div className="intro-label eyebrow">The way in</div>
              <h2 className="how-title display" id="how-title">Your new<br /><em>Friday ritual.</em></h2>
              <p className="how-intro">A little curiosity, one tap, and a very good reason to make plans.</p>
            </div>
            <div className="steps">
              <article className="step"><span className="step-no">01</span><h3>Find the signal.</h3><p>See a keychain, tap an NFC tag, or follow a friend’s link.</p></article>
              <article className="step"><span className="step-no">02</span><h3>Meet the menu.</h3><p>A chef-made drop appears with the story behind every plate.</p></article>
              <article className="step"><span className="step-no">03</span><h3>Reserve your share.</h3><p>Preorder while the batch is open. No guesswork, no wasted food.</p></article>
              <article className="step"><span className="step-no">04</span><h3>Show up hungry.</h3><p>Collect, connect and tell someone about it before the last bite.</p></article>
            </div>
          </div>
        </section>

        <section className="chefs section-pad" id="chefs" aria-labelledby="chefs-title">
          <div className="chefs-grid">
            <div className="chefs-copy">
              <div className="intro-label eyebrow">For the ones cooking</div>
              <h2 className="display" id="chefs-title">Put your<br /><em>secret</em> on<br />the table.</h2>
              <p>Friday Food Club gives independent chefs a room full of people ready to taste the thing you have been saving for later.</p>
              <button className="gold-button chef-cta" type="button" data-testid="button-apply-chef" onClick={() => setModal('chef')}>Talk to the club</button>
            </div>
            <div className="chef-art" aria-label="Featured chef card">
              <div className="chef-stamp">MADE HERE<br />SHARED HERE</div>
              <div className="chef-card">
                <div />
                <span className="eyebrow">Chef profile / 004</span>
                <h3>Kiran makes<br />Sunday lunch.</h3>
                <p>From a home kitchen in St. James to your Friday table.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="club section-pad" id="join" aria-labelledby="join-title">
          <div className="club-grid">
            <div>
              <div className="eyebrow">A note worth opening</div>
              <h2 className="display" id="join-title">Keep a seat<br /><em>at the table.</em></h2>
            </div>
            <div className="club-copy">
              <p>Drop alerts, chef stories and the occasional very good excuse to leave work on time. No noise. Just the good stuff.</p>
              <form className="club-form" onSubmit={handleClubSubmit}>
                <input type="email" name="email" required placeholder="Your email address" aria-label="Your email address" data-testid="input-club-email" />
                <button type="submit" data-testid="button-join-club-submit">Count me in</button>
              </form>
              <div className="form-message" role="status" data-testid="status-club-form">{formMessage}</div>
              <div className="member-perks">
                <div className="eyebrow">Club pass, when you are ready</div>
                <p>First access. Friend pricing. Better Fridays.</p>
                <span>We will tell you when passes open. Until then, the Friday note is free.</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer section-pad">
        <div className="footer-main">
          <div className="footer-mark">
            <a className="brand-lockup" href="#top" data-testid="link-footer-home">
              <img src={goldLogo} alt="Friday Food Club" />
              <span className="brand-wordmark"><strong>Friday</strong><span>Food Club</span></span>
            </a>
            <p>Chef-made food drops for Trinidad and Tobago. Find the signal. Follow the flavour.</p>
          </div>
          <div className="footer-links">
            <div><strong>Explore</strong><a href="#drops" data-testid="link-footer-drops">Secret Drops</a><a href="#how-it-works" data-testid="link-footer-how">How it works</a><a href="#join" data-testid="link-footer-join">Join the club</a></div>
            <div><strong>Make</strong><a href="#chefs" data-testid="link-footer-chefs">For chefs</a><button type="button" className="text-link" data-testid="button-footer-contact" onClick={() => setModal('chef')}>Contact the club</button></div>
          </div>
        </div>
        <div className="footer-bottom"><span>© 2025 Friday Food Club</span><span>Trinidad &amp; Tobago / Made for sharing</span></div>
      </footer>

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="modal-close" type="button" aria-label="Close dialog" data-testid="button-close-modal" onClick={closeModal}>×</button>
            {modal === 'drop' ? (
              <>
                <div className="eyebrow">Friday Food Club / Drop no. {selectedDrop.id}</div>
                <h2 id="modal-title">{selectedDrop.title}</h2>
                <p>{selectedDrop.details}</p>
                <p className="mono">{selectedDrop.price} · Preorders open soon</p>
                <button className="gold-button" type="button" data-testid="button-drop-notify-modal" onClick={() => setModal('member')}>Tell me when it opens</button>
              </>
            ) : (
              <>
                <div className="eyebrow">{modal === 'chef' ? 'For chefs and makers' : 'Welcome in'}</div>
                <h2 id="modal-title">{modal === 'chef' ? 'Bring us your best kept secret.' : 'The good stuff is closer than you think.'}</h2>
                <p>{modal === 'chef' ? 'Tell us a little about what you cook and where you are based. We are always looking for the next delicious thing.' : 'Leave your email and we will send the next drop, plus the story that makes it worth showing up for.'}</p>
                <form className="modal-form" onSubmit={handleModalSubmit}>
                  <input name="name" required placeholder={modal === 'chef' ? 'Your name' : 'Your name'} data-testid="input-modal-name" />
                  <input name="email" type="email" required placeholder="Email address" data-testid="input-modal-email" />
                  {modal === 'chef' && <textarea name="note" rows={3} placeholder="What are you cooking?" data-testid="input-modal-note" />}
                  <button type="submit" data-testid="button-modal-submit">{modal === 'chef' ? 'Start a conversation' : 'Join the Friday note'}</button>
                  <div className="form-message" role="status" data-testid="status-modal-form">{modalMessage}</div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Router({ liveDropsEnabled }: { liveDropsEnabled: boolean }) {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={() => <Home liveDropsEnabled={liveDropsEnabled} />} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          {convexClient ? (
            <ConvexProvider client={convexClient}>
              <Router liveDropsEnabled />
            </ConvexProvider>
          ) : (
            <Router liveDropsEnabled={false} />
          )}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
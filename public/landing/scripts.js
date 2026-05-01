document.addEventListener('DOMContentLoaded', () => {
    document.cookie = 'br_seen_landing=1; Path=/; Max-Age=2592000; SameSite=Lax';

    const navbar = document.getElementById('navbar');
    const link1 = document.getElementById('link-1');
    const link2 = document.getElementById('link-2');
    const link3 = document.getElementById('link-3');
    const link4 = document.getElementById('link-4');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    // ===== Navbar Scroll Effect =====
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('glass-nav');
            navbar.classList.remove('py-5');
            navbar.classList.add('py-3');
            link1?.classList.remove('text-white'); link1?.classList.add('text-gray-600', 'hover:text-corallo');
            link2?.classList.remove('text-white'); link2?.classList.add('text-gray-600', 'hover:text-corallo');
            link3?.classList.remove('text-white'); link3?.classList.add('text-gray-600', 'hover:text-corallo');
            link4?.classList.remove('text-white'); link4?.classList.add('text-gray-600', 'hover:text-corallo');
            mobileBtn?.classList.remove('text-white'); mobileBtn?.classList.add('text-gray-900');
        } else {
            navbar.classList.remove('glass-nav');
            navbar.classList.add('py-5');
            navbar.classList.remove('py-3');
            link1?.classList.add('text-white'); link1?.classList.remove('text-gray-600', 'hover:text-corallo');
            link2?.classList.add('text-white'); link2?.classList.remove('text-gray-600', 'hover:text-corallo');
            link3?.classList.add('text-white'); link3?.classList.remove('text-gray-600', 'hover:text-corallo');
            link4?.classList.add('text-white'); link4?.classList.remove('text-gray-600', 'hover:text-corallo');
            mobileBtn?.classList.add('text-white'); mobileBtn?.classList.remove('text-gray-900');
        }
    });

    // ===== Mobile Menu =====
    mobileBtn?.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });

    const mobileLinks = mobileMenu?.querySelectorAll('a') || [];
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => mobileMenu.classList.add('hidden'));
    });

    // ===== Scroll Reveal (IntersectionObserver) =====
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.08,
        rootMargin: '0px 0px -60px 0px'
    });

    // Observe all elements with reveal classes
    document.querySelectorAll('.reveal, .reveal-scale, .reveal-left, .reveal-right').forEach(el => {
        revealObserver.observe(el);
    });

    // ===== Animated Counters =====
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('[data-counter]').forEach(el => {
        counterObserver.observe(el);
    });

    function animateCounter(el) {
        const target = parseInt(el.getAttribute('data-counter'), 10);
        const suffix = el.getAttribute('data-suffix') || '';
        const prefix = el.getAttribute('data-prefix') || '';
        const duration = 1800;
        const start = performance.now();

        function renderValue(value) {
            if (suffix === 'min') {
                el.textContent = `${prefix}${value}`;
                const suffixEl = document.createElement('span');
                suffixEl.className = 'text-3xl ml-1';
                suffixEl.textContent = 'min';
                el.appendChild(suffixEl);
            } else {
                el.textContent = prefix + value + suffix;
            }
        }

        // If target is 0, just render immediately
        if (target === 0) {
            renderValue(0);
            return;
        }

        function update(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * target);
            renderValue(current);
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    }

    const querySelectorSafe = (selector) => {
        if (!selector || selector === '#') return null;
        try {
            return document.querySelector(selector);
        } catch (_) {
            return null;
        }
    };

    const focusFieldSafe = (selector) => {
        const field = querySelectorSafe(selector);
        if (!field || typeof field.focus !== 'function') return;
        window.setTimeout(() => {
            field.focus({ preventScroll: true });
        }, 350);
    };

    // ===== Smooth Scroll for anchor links =====
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href') || '';
            if (href === '#') {
                e.preventDefault();
                return;
            }
            const target = querySelectorSafe(href);
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const focusTarget = this.getAttribute('data-focus-target');
            if (focusTarget) {
                focusFieldSafe(focusTarget);
            }
        });
    });

    // ===== Scroll+Focus Buttons =====
    document.querySelectorAll('[data-scroll-target]').forEach((node) => {
        node.addEventListener('click', () => {
            const targetSelector = node.getAttribute('data-scroll-target');
            const target = querySelectorSafe(targetSelector);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            const focusTarget = node.getAttribute('data-focus-target');
            if (focusTarget) {
                focusFieldSafe(focusTarget);
            }
        });
    });

    // ===== Summer Countdown Timer =====
    function updateCountdown() {
        const summer = new Date('2026-06-21T00:00:00');
        const now = new Date();
        const diff = summer - now;

        if (diff <= 0) {
            const el = document.getElementById('summer-countdown');
            if (el) {
                el.textContent = '';
                const icon = document.createElement('span');
                icon.className = 'text-lg';
                icon.textContent = '☀️';
                const text = document.createElement('span');
                text.className = 'text-sm font-bold text-corallo';
                text.textContent = "L'estate è arrivata! La lista prioritaria è aperta.";
                el.append(icon, text);
            }
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        const daysEl = document.getElementById('cd-days');
        const hoursEl = document.getElementById('cd-hours');
        const minsEl = document.getElementById('cd-mins');
        const secsEl = document.getElementById('cd-secs');

        if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
        if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
        if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
        if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    const initRadarSequence = () => {
        const stage = document.getElementById('radar-sequence-stage');
        const canvas = document.getElementById('radar-sequence-canvas');
        const loader = document.getElementById('radar-sequence-loader');
        const progressEl = document.getElementById('radar-sequence-progress');
        const indicator = document.getElementById('radar-sequence-indicator');
        const beatNodes = [...document.querySelectorAll('[data-sequence-beat]')];
        if (!stage || !canvas || beatNodes.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const clamp01 = (value) => Math.min(1, Math.max(0, value));
        const PROGRESS_EPSILON = 0.0001;
        // Both viewports drive 120 logical frames. Mobile sources every-other
        // frame from the 240-frame asset bundle (logical i → file 2*i).
        const DESKTOP_COUNT = 120;
        const MOBILE_COUNT = 120;
        const MOBILE_SOURCE_STRIDE = 2;
        // First-pass stride: load every Nth frame so the user gets a coherent
        // preview of the whole sequence almost immediately.
        const FIRST_PASS_STRIDE = 16;
        const REFINE_STRIDES = [8, 4, 2, 1];

        let isMobileView = window.innerWidth < 768;
        let frames = [];
        let loadedCount = 0;
        let firstPassTotal = 1;
        let lastDrawKey = '';
        let lastDrawnFrameIndex = 0;
        let scrollDirection = 0;
        let currentProgress = 0;
        let targetProgress = 0;
        let rafId = 0;
        let pendingResize = false;
        let loadVersion = 0;
        let sequenceActivated = false;
        let progressiveLoadStarted = false;
        let listenersBound = false;

        const beats = beatNodes.map((node) => ({
            node,
            range: (node.getAttribute('data-range') || '')
                .split(',')
                .map((entry) => Number(entry.trim()))
                .filter((entry) => Number.isFinite(entry)),
        })).filter((item) => item.range.length === 4);

        const getActiveFrameCount = () => (isMobileView ? MOBILE_COUNT : DESKTOP_COUNT);
        const getSequencePath = () => (isMobileView ? '/sequence/mobile' : '/sequence');
        const getSourceFrameIndex = (logicalIndex) => (
            isMobileView ? logicalIndex * MOBILE_SOURCE_STRIDE : logicalIndex
        );

        const buildStrideIndexes = (total, stride) => {
            const out = [];
            for (let i = 0; i < total; i += stride) out.push(i);
            if (out[out.length - 1] !== total - 1) out.push(total - 1);
            return out;
        };

        const collectMissing = (total, stride) => {
            const out = [];
            for (let i = 0; i < total; i += stride) {
                if (!frames[i]) out.push(i);
            }
            if (!frames[total - 1] && (total - 1) % stride !== 0) {
                out.push(total - 1);
            }
            return out;
        };

        const resolveFrameForDirection = (frameList, targetIndex, direction, fallbackIndex) => {
            const direct = frameList[targetIndex];
            if (direct) {
                return { image: direct, index: targetIndex };
            }

            const preferredOffsetSign = direction < 0 ? 1 : -1;
            for (let radius = 1; radius < frameList.length; radius += 1) {
                const preferredIndex = targetIndex + preferredOffsetSign * radius;
                if (preferredIndex >= 0 && preferredIndex < frameList.length && frameList[preferredIndex]) {
                    return { image: frameList[preferredIndex], index: preferredIndex };
                }

                const oppositeIndex = targetIndex - preferredOffsetSign * radius;
                if (oppositeIndex >= 0 && oppositeIndex < frameList.length && frameList[oppositeIndex]) {
                    return { image: frameList[oppositeIndex], index: oppositeIndex };
                }
            }

            if (fallbackIndex >= 0 && fallbackIndex < frameList.length && frameList[fallbackIndex]) {
                return { image: frameList[fallbackIndex], index: fallbackIndex };
            }

            return { image: null, index: targetIndex };
        };

        const setLoaderProgress = () => {
            if (!progressEl) return;
            const readyTarget = Math.max(1, firstPassTotal);
            const percent = Math.round((Math.min(loadedCount, readyTarget) / readyTarget) * 100);
            progressEl.textContent = `${percent}%`;
        };

        const showLoader = () => {
            if (!loader) return;
            loader.style.display = '';
            loader.classList.remove('opacity-0', 'pointer-events-none');
        };

        const hideLoader = () => {
            if (!loader) return;
            loader.classList.add('opacity-0', 'pointer-events-none');
            window.setTimeout(() => {
                loader.style.display = 'none';
            }, 550);
        };

        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (!parent) return false;
            const dpr = Math.min(window.devicePixelRatio || 1, isMobileView ? 1.5 : 2);
            const rect = parent.getBoundingClientRect();
            const nextWidth = Math.max(1, Math.floor(rect.width * dpr));
            const nextHeight = Math.max(1, Math.floor(rect.height * dpr));
            const changed = canvas.width !== nextWidth || canvas.height !== nextHeight;

            if (changed) {
                canvas.width = nextWidth;
                canvas.height = nextHeight;
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
            }

            return changed;
        };

        const applyBeatStyles = () => {
            beats.forEach(({ node, range }) => {
                const [start, enterEnd, exitStart, end] = range;
                let opacity = 0;
                let y = 20;

                if (currentProgress >= start && currentProgress <= enterEnd) {
                    const local = clamp01((currentProgress - start) / Math.max(enterEnd - start, 0.0001));
                    opacity = local;
                    y = 20 - (20 * local);
                } else if (currentProgress > enterEnd && currentProgress < exitStart) {
                    opacity = 1;
                    y = 0;
                } else if (currentProgress >= exitStart && currentProgress <= end) {
                    const local = clamp01((currentProgress - exitStart) / Math.max(end - exitStart, 0.0001));
                    opacity = 1 - local;
                    y = -20 * local;
                }

                node.style.opacity = opacity.toFixed(3);
                node.style.transform = `translate3d(0, ${y}px, 0)`;
            });

            if (indicator) {
                indicator.style.opacity = (1 - clamp01(currentProgress / 0.1)).toFixed(3);
            }
        };

        const drawFrame = () => {
            const resized = resizeCanvas();
            if (frames.length === 0) return;

            const targetFrameIndex = Math.min(
                frames.length - 1,
                Math.max(0, Math.round(currentProgress * (frames.length - 1))),
            );
            const { image, index } = resolveFrameForDirection(
                frames,
                targetFrameIndex,
                scrollDirection,
                lastDrawnFrameIndex,
            );
            if (!image) return;

            const drawKey = `${isMobileView ? 'm' : 'd'}-${index}-${canvas.width}x${canvas.height}`;
            if (!resized && drawKey === lastDrawKey) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            lastDrawnFrameIndex = index;
            const canvasAspect = canvas.width / canvas.height;
            const imageAspect = image.width / image.height;
            let drawWidth;
            let drawHeight;
            let offsetX;
            let offsetY;

            if (isMobileView) {
                if (imageAspect > canvasAspect) {
                    drawHeight = canvas.height;
                    drawWidth = canvas.height * imageAspect;
                    offsetX = (canvas.width - drawWidth) / 2;
                    offsetY = 0;
                } else {
                    drawWidth = canvas.width;
                    drawHeight = canvas.width / imageAspect;
                    offsetX = 0;
                    offsetY = (canvas.height - drawHeight) / 2;
                }
            } else if (imageAspect > canvasAspect) {
                drawWidth = canvas.width;
                drawHeight = canvas.width / imageAspect;
                offsetX = 0;
                offsetY = (canvas.height - drawHeight) / 2;
            } else {
                drawHeight = canvas.height;
                drawWidth = canvas.height * imageAspect;
                offsetX = (canvas.width - drawWidth) / 2;
                offsetY = 0;
            }

            ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
            lastDrawKey = drawKey;
        };

        const requestTick = () => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(tick);
        };

        const tick = () => {
            rafId = 0;

            if (Math.abs(targetProgress - currentProgress) > 0.0005) {
                currentProgress += (targetProgress - currentProgress) * 0.12;
            } else {
                currentProgress = targetProgress;
            }

            drawFrame();
            applyBeatStyles();

            if (pendingResize || Math.abs(targetProgress - currentProgress) > 0.0005) {
                pendingResize = false;
                requestTick();
            }
        };

        const loadFrameList = async ({ version, indexes, concurrency, sequencePath }) => {
            let cursor = 0;

            const loadSingle = (logicalIndex) => new Promise((resolve) => {
                if (version !== loadVersion) {
                    resolve();
                    return;
                }
                if (frames[logicalIndex]) {
                    resolve();
                    return;
                }

                const sourceIndex = getSourceFrameIndex(logicalIndex);
                const image = new Image();
                image.decoding = 'async';
                if ('fetchPriority' in image) {
                    image.fetchPriority = logicalIndex === 0 ? 'high' : 'low';
                }
                image.src = `${sequencePath}/frame_${sourceIndex}.webp`;
                image.onload = () => {
                    if (version === loadVersion && !frames[logicalIndex]) {
                        frames[logicalIndex] = image;
                        loadedCount += 1;
                        setLoaderProgress();
                        requestTick();
                    }
                    resolve();
                };
                image.onerror = () => {
                    resolve();
                };
            });

            const worker = async () => {
                while (version === loadVersion) {
                    const i = cursor;
                    cursor += 1;
                    if (i >= indexes.length) return;
                    await loadSingle(indexes[i]);
                }
            };

            const workers = Array.from({ length: concurrency }, () => worker());
            await Promise.all(workers);
        };

        const loadInitialFrames = async () => {
            loadVersion += 1;
            const version = loadVersion;

            const activeCount = getActiveFrameCount();
            const sequencePath = getSequencePath();
            progressiveLoadStarted = false;
            loadedCount = 0;
            frames = Array.from({ length: activeCount }, () => null);
            lastDrawKey = '';
            lastDrawnFrameIndex = 0;

            const firstPassIndexes = buildStrideIndexes(activeCount, FIRST_PASS_STRIDE);
            firstPassTotal = firstPassIndexes.length;

            setLoaderProgress();
            showLoader();

            await loadFrameList({
                version,
                indexes: firstPassIndexes,
                concurrency: isMobileView ? 4 : 6,
                sequencePath,
            });

            if (version !== loadVersion) return;
            hideLoader();
            drawFrame();
            applyBeatStyles();
        };

        const loadRemainingFrames = async () => {
            if (progressiveLoadStarted || !sequenceActivated || frames.length === 0) return;
            progressiveLoadStarted = true;
            const version = loadVersion;
            const activeCount = getActiveFrameCount();
            const sequencePath = getSequencePath();

            for (const stride of REFINE_STRIDES) {
                if (version !== loadVersion) return;
                const indexes = collectMissing(activeCount, stride);
                if (indexes.length === 0) continue;
                await loadFrameList({
                    version,
                    indexes,
                    concurrency: isMobileView ? 4 : 6,
                    sequencePath,
                });
                if (version !== loadVersion) return;
                drawFrame();
            }
            applyBeatStyles();
        };

        const updateTargetProgress = () => {
            if (!sequenceActivated) return;

            const maxScroll = stage.offsetHeight - window.innerHeight;
            const rect = stage.getBoundingClientRect();
            const nextProgress = maxScroll <= 0 ? 0 : clamp01((-rect.top) / maxScroll);

            if (nextProgress > targetProgress + PROGRESS_EPSILON) {
                scrollDirection = 1;
            } else if (nextProgress < targetProgress - PROGRESS_EPSILON) {
                scrollDirection = -1;
            }

            targetProgress = nextProgress;
            requestTick();

            if (nextProgress > 0.015) {
                void loadRemainingFrames();
            }
        };

        const activateSequence = () => {
            if (sequenceActivated) return;
            sequenceActivated = true;
            void loadInitialFrames().then(() => {
                updateTargetProgress();
                requestTick();
            });
        };

        const bindListeners = () => {
            if (listenersBound) return;
            listenersBound = true;
            window.addEventListener('scroll', updateTargetProgress, { passive: true });
            window.addEventListener('resize', handleViewportChange);
            window.addEventListener('orientationchange', handleViewportChange);
            stage.addEventListener('pointerdown', () => { void loadRemainingFrames(); }, { passive: true });
            stage.addEventListener('touchstart', () => { void loadRemainingFrames(); }, { passive: true });
            stage.addEventListener('wheel', () => { void loadRemainingFrames(); }, { passive: true });
        };

        const handleViewportChange = () => {
            const nextMobileView = window.innerWidth < 768;
            pendingResize = true;
            if (nextMobileView !== isMobileView) {
                isMobileView = nextMobileView;
                if (sequenceActivated) {
                    void loadInitialFrames().then(() => {
                        updateTargetProgress();
                        requestTick();
                    });
                }
            } else {
                requestTick();
            }
            updateTargetProgress();
        };

        bindListeners();
        const activationObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                activationObserver.unobserve(stage);
                activateSequence();
            });
        }, {
            threshold: 0.01,
            rootMargin: '300px 0px',
        });
        activationObserver.observe(stage);
    };

    initRadarSequence();

    // ===== Email Form Submission (Supabase signup via API) =====
    const SIGNUP_ENDPOINT = '/api/signup';
    const BUSINESS_REQUEST_ENDPOINT = '/api/business-request';
    const ANALYTICS_ENDPOINT = '/api/analytics';
    const ACCOUNT_PREFS_STORAGE_KEY = 'w2b-account-prefs-v1';
    const ANALYTICS_SESSION_KEY = 'w2b_landing_session_v1';
    const SIGNUP_REQUEST_TIMEOUT_MS = 10000;
    const SIGNUP_REQUEST_RETRIES = 1;
    const RESERVED_EMAIL_DOMAIN_SUFFIXES = ['.example', '.invalid', '.localhost', '.local', '.test'];
    const BLOCKED_EMAIL_DOMAINS = new Set([
        'example.com',
        'example.org',
        'example.net',
        'mailinator.com',
        'guerrillamail.com',
        '10minutemail.com',
        'tempmail.com',
        'yopmail.com',
        'sharklasers.com',
        'trashmail.com',
    ]);

    const parseQueryParams = (search) => {
        const paramsObj = {};
        const searchParams = new URLSearchParams(search || '');
        for (const [key, value] of searchParams.entries()) {
            paramsObj[key] = value;
        }
        return paramsObj;
    };

    const createAnalyticsEventId = () => {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return '';
    };

    const getLandingSessionId = () => {
        const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
        if (existing && existing.length >= 8) return existing;
        const next = (window.crypto && typeof window.crypto.randomUUID === 'function')
            ? window.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, next);
        return next;
    };

    const analyticsOnce = new Set();
    const trackLandingEvent = (eventName, props = {}, options = {}) => {
        if (!eventName) return;
        const onceKey = options.onceKey || '';
        if (onceKey && analyticsOnce.has(onceKey)) return;

        const params = parseQueryParams(window.location.search);
        const payload = {
            eventName,
            ts: new Date().toISOString(),
            sessionId: getLandingSessionId(),
            path: `${window.location.pathname}${window.location.search}`,
            eventId: createAnalyticsEventId() || undefined,
            utm_source: params.utm_source || undefined,
            utm_medium: params.utm_medium || undefined,
            utm_campaign: params.utm_campaign || undefined,
            utm_content: params.utm_content || undefined,
            utm_term: params.utm_term || undefined,
            src: params.src || params.from || 'landing',
            props,
        };

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 1800);
        fetch(ANALYTICS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
            keepalive: true,
            signal: controller.signal,
        }).catch(() => {
            // Fail silent: analytics must never block conversion.
        }).finally(() => {
            window.clearTimeout(timeoutId);
        });

        if (onceKey) {
            analyticsOnce.add(onceKey);
        }
    };

    const buildAttribution = (paramsObj) => {
        const allowedKeys = [
            'poster',
            'city',
            'fbclid',
            'gclid',
            'msclkid',
            'ttclid',
            'igshid',
            'twclid',
            'gbraid',
            'wbraid',
        ];
        const out = {};
        allowedKeys.forEach((key) => {
            if (paramsObj[key]) out[key] = paramsObj[key];
        });
        return out;
    };

    const readAccountPrefs = () => {
        try {
            const raw = localStorage.getItem(ACCOUNT_PREFS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    };

    const readPreferredLanguage = (paramsObj) => {
        if (paramsObj.lang === 'en' || paramsObj.lang === 'it') {
            return paramsObj.lang;
        }
        const prefs = readAccountPrefs();
        return prefs.language === 'en' ? 'en' : 'it';
    };

    const readPreferredInterests = () => {
        const prefs = readAccountPrefs();
        if (!Array.isArray(prefs.interests)) return [];
        return prefs.interests
            .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => entry.trim().slice(0, 32))
            .slice(0, 8);
    };

    const getEmailDomain = (email) => {
        const separator = email.lastIndexOf('@');
        if (separator <= 0 || separator >= email.length - 1) return '';
        return email.slice(separator + 1).toLowerCase();
    };

    const getBusinessEmailClientError = (email) => {
        const domain = getEmailDomain(email);
        if (!domain || !domain.includes('.')) return 'invalid_email';
        if (RESERVED_EMAIL_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix))) {
            return 'invalid_email_domain';
        }
        if (BLOCKED_EMAIL_DOMAINS.has(domain)) {
            return 'disposable_email_domain';
        }
        return '';
    };

    trackLandingEvent('landing_view', {
        section: 'landing',
        variant: 'landing_v2',
    }, { onceKey: 'landing_view' });

    let scrollMilestoneRaf = 0;
    const trackScrollMilestones = () => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollHeight = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0);
        const maxScrollable = Math.max(scrollHeight - window.innerHeight, 1);
        const depth = clampDepth(window.scrollY / maxScrollable);

        if (depth >= 0.5) {
            trackLandingEvent('scroll_50', { section: 'landing', depth: 0.5 }, { onceKey: 'scroll_50' });
        }
        if (depth >= 0.9) {
            trackLandingEvent('scroll_90', { section: 'landing', depth: 0.9 }, { onceKey: 'scroll_90' });
        }
    };
    const clampDepth = (value) => Math.min(1, Math.max(0, value));
    window.addEventListener('scroll', () => {
        if (scrollMilestoneRaf) return;
        scrollMilestoneRaf = window.requestAnimationFrame(() => {
            scrollMilestoneRaf = 0;
            trackScrollMilestones();
        });
    }, { passive: true });
    trackScrollMilestones();

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const ctaNode = target.closest('[data-cta-id]');
        if (!ctaNode) return;
        trackLandingEvent('cta_click', {
            section: ctaNode.getAttribute('data-cta-section') || 'unknown',
            cta_id: ctaNode.getAttribute('data-cta-id') || 'unknown',
            variant: ctaNode.getAttribute('data-cta-variant') || 'default',
        });
    });

    const waitMs = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const submitSignupAttempt = async (payload) => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), SIGNUP_REQUEST_TIMEOUT_MS);
        try {
            let response;
            try {
                response = await fetch(SIGNUP_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify(payload),
                    keepalive: true,
                    signal: controller.signal,
                });
            } catch (fetchError) {
                const error = new Error('request_failed');
                error.code = 'request_failed';
                error.reason = fetchError && fetchError.name === 'AbortError' ? 'timeout' : 'network';
                throw error;
            }

            let data = null;
            try {
                data = await response.json();
            } catch (_) {
                data = null;
            }

            if (!response.ok) {
                const error = new Error('request_failed');
                error.code = data && data.error ? data.error : 'request_failed';
                error.reason = 'http';
                throw error;
            }

            return data || { ok: true, already: false };
        } finally {
            window.clearTimeout(timeoutId);
        }
    };

    const submitSignup = async (payload) => {
        let attempt = 0;
        while (attempt <= SIGNUP_REQUEST_RETRIES) {
            try {
                return await submitSignupAttempt(payload);
            } catch (error) {
                const retryable = error && error.code === 'request_failed' && (error.reason === 'timeout' || error.reason === 'network');
                if (!retryable || attempt >= SIGNUP_REQUEST_RETRIES) {
                    throw error;
                }
                attempt += 1;
                await waitMs(250 * attempt);
            }
        }
        throw new Error('request_failed');
    };

    const initSignupForm = (form) => {
        const input = form.querySelector('[data-signup-input]');
        const honeypot = form.querySelector('input[name="company"]');
        const submitBtn = form.querySelector('[data-signup-submit]');
        const feedbackEl = form.querySelector('[data-signup-feedback]');
        if (!input || !submitBtn) return;

        const setFeedback = (message, tone) => {
            if (!feedbackEl) return;
            feedbackEl.textContent = message;
            feedbackEl.classList.remove('text-onda/90', 'text-green-300', 'text-red-300');
            if (tone === 'success') {
                feedbackEl.classList.add('text-green-300');
                return;
            }
            if (tone === 'error') {
                feedbackEl.classList.add('text-red-300');
                return;
            }
            feedbackEl.classList.add('text-onda/90');
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = String(input.value || '').trim().toLowerCase();
            const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!emailValid) {
                setFeedback('Inserisci un indirizzo email valido.', 'error');
                return;
            }

            const originalBtnText = submitBtn.textContent;
            submitBtn.disabled = true;
            input.disabled = true;
            submitBtn.textContent = 'Invio...';
            setFeedback('Stiamo salvando la tua iscrizione.', 'neutral');
            const section = form.id === 'landing-email-form-hero' ? 'hero' : 'waitlist';
            trackLandingEvent('signup_submit', {
                section,
                cta_id: form.id || 'signup_form',
                variant: 'landing_v2',
            });

            try {
                const params = parseQueryParams(window.location.search);
                const utm = {};
                Object.keys(params).forEach((key) => {
                    if (key.toLowerCase().startsWith('utm_')) {
                        utm[key] = params[key];
                    }
                });

                const payload = {
                    email,
                    lang: readPreferredLanguage(params),
                    page: window.location.pathname,
                    referrer: document.referrer || null,
                    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
                    device: {
                        w: window.innerWidth,
                        h: window.innerHeight,
                        dpr: window.devicePixelRatio || 1,
                        ua: navigator.userAgent,
                    },
                    hp: honeypot ? String(honeypot.value || '').trim() : '',
                    utm,
                    attribution: buildAttribution(params),
                    project: 'where2beach',
                    version: 'landing_v2',
                    meta: {
                        interests: readPreferredInterests(),
                        source: params.from || 'landing',
                    },
                };

                const result = await submitSignup(payload);
                submitBtn.classList.add('bg-green-500');
                submitBtn.classList.remove('bg-corallo');
                submitBtn.textContent = '✓ Sei in lista';
                input.value = '';
                if (result && result.already) {
                    setFeedback('Email già presente: posizione in lista confermata.', 'success');
                } else {
                    setFeedback('Perfetto. Ti avviseremo appena apriamo il lancio.', 'success');
                }
                trackLandingEvent('signup_success', {
                    section,
                    cta_id: form.id || 'signup_form',
                    variant: result && result.already ? 'already' : 'new',
                });
            } catch (error) {
                const code = error && error.code ? error.code : '';
                if (code === 'invalid_email') {
                    setFeedback('Inserisci un indirizzo email valido.', 'error');
                } else if (code === 'rate_limited') {
                    setFeedback('Troppi tentativi ravvicinati. Riprova tra poco.', 'error');
                } else {
                    setFeedback('Errore temporaneo. Riprova tra qualche secondo.', 'error');
                }
                trackLandingEvent('signup_error', {
                    section,
                    cta_id: form.id || 'signup_form',
                    variant: code || 'request_failed',
                });
                submitBtn.classList.remove('bg-green-500');
                submitBtn.classList.add('bg-corallo');
                submitBtn.textContent = originalBtnText;
            } finally {
                if (submitBtn.textContent !== '✓ Sei in lista') {
                    submitBtn.disabled = false;
                    input.disabled = false;
                }
            }
        });
    };

    const signupForms = document.querySelectorAll('[data-signup-form]');
    signupForms.forEach((form) => initSignupForm(form));

    const submitBusinessRequest = async (payload) => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(BUSINESS_REQUEST_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
                keepalive: true,
                signal: controller.signal,
            });

            let data = null;
            try {
                data = await response.json();
            } catch (_) {
                data = null;
            }

            if (!response.ok) {
                const error = new Error('request_failed');
                error.code = data && data.error ? data.error : 'request_failed';
                throw error;
            }

            return data || { ok: true, already: false, notified: false };
        } finally {
            window.clearTimeout(timeoutId);
        }
    };

    const initBusinessRequestForm = (form) => {
        const businessType = form.querySelector('[data-business-type]');
        const companyName = form.querySelector('[data-business-company]');
        const city = form.querySelector('[data-business-city]');
        const contactName = form.querySelector('[data-business-contact]');
        const role = form.querySelector('[data-business-role]');
        const email = form.querySelector('[data-business-email]');
        const phone = form.querySelector('[data-business-phone]');
        const message = form.querySelector('[data-business-message]');
        const honeypot = form.querySelector('[data-business-hp]');
        const consent = form.querySelector('[data-business-consent]');
        const submitBtn = form.querySelector('[data-business-submit]');
        const feedbackEl = form.querySelector('[data-business-feedback]');

        if (!businessType || !companyName || !city || !contactName || !role || !email || !consent || !submitBtn) {
            return;
        }

        const setFeedback = (text, tone) => {
            if (!feedbackEl) return;
            feedbackEl.textContent = text;
            feedbackEl.classList.remove('text-red-500', 'text-emerald-600', 'text-gray-500');
            if (tone === 'error') {
                feedbackEl.classList.add('text-red-500');
                return;
            }
            if (tone === 'success') {
                feedbackEl.classList.add('text-emerald-600');
                return;
            }
            feedbackEl.classList.add('text-gray-500');
        };

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const emailValue = String(email.value || '').trim().toLowerCase();
            const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
            if (!emailValid) {
                setFeedback('Inserisci un indirizzo email valido (es. nome@azienda.it).', 'error');
                return;
            }
            const clientEmailError = getBusinessEmailClientError(emailValue);
            if (clientEmailError === 'invalid_email_domain') {
                setFeedback('Il dominio email non è valido. Usa un indirizzo reale (es. nome@azienda.it).', 'error');
                return;
            }
            if (clientEmailError === 'disposable_email_domain') {
                setFeedback('Email temporanee non accettate. Inserisci un indirizzo reale, preferibilmente aziendale.', 'error');
                return;
            }
            if (!consent.checked) {
                setFeedback('Devi accettare la privacy per inviare la richiesta.', 'error');
                return;
            }

            const params = parseQueryParams(window.location.search);
            const utm = {};
            Object.keys(params).forEach((key) => {
                if (key.toLowerCase().startsWith('utm_')) utm[key] = params[key];
            });

            const initialText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Invio...';
            setFeedback('Invio richiesta in corso.', 'neutral');

            try {
                const payload = {
                    businessType: String(businessType.value || '').trim(),
                    companyName: String(companyName.value || '').trim(),
                    city: String(city.value || '').trim(),
                    contactName: String(contactName.value || '').trim(),
                    role: String(role.value || '').trim(),
                    email: emailValue,
                    phone: phone ? String(phone.value || '').trim() : '',
                    message: message ? String(message.value || '').trim() : '',
                    lang: readPreferredLanguage(params),
                    hp: honeypot ? String(honeypot.value || '').trim() : '',
                    utm,
                    attribution: buildAttribution(params),
                    meta: {
                        page: window.location.pathname,
                        referrer: document.referrer || null,
                        source: params.src || params.from || 'landing',
                        interests: readPreferredInterests(),
                    },
                };

                const result = await submitBusinessRequest(payload);
                if (result && result.already) {
                    setFeedback('Richiesta già ricevuta di recente. Ti ricontattiamo a breve.', 'success');
                } else {
                    setFeedback('Perfetto, richiesta inviata. Il team business ti contatterà presto.', 'success');
                }
                submitBtn.textContent = 'Richiesta inviata ✓';
                form.reset();
                submitBtn.disabled = false;
                window.setTimeout(() => {
                    submitBtn.textContent = initialText || 'Invia richiesta partnership';
                }, 1800);
            } catch (error) {
                const code = error && error.code ? error.code : '';
                if (code === 'rate_limited') {
                    setFeedback('Troppi tentativi ravvicinati. Riprova tra poco.', 'error');
                } else if (code === 'invalid_email') {
                    setFeedback('Email non valida. Inserisci un indirizzo completo (es. nome@azienda.it).', 'error');
                } else if (code === 'invalid_email_domain') {
                    setFeedback('Dominio email non trovato. Controlla eventuali errori di battitura nel dominio.', 'error');
                } else if (code === 'disposable_email_domain') {
                    setFeedback('Email temporanee non accettate. Usa un indirizzo reale, preferibilmente aziendale.', 'error');
                } else {
                    setFeedback('Errore temporaneo. Riprova tra qualche minuto.', 'error');
                }
                submitBtn.disabled = false;
                submitBtn.textContent = initialText || 'Invia richiesta partnership';
            }
        });
    };

    const businessRequestForms = document.querySelectorAll('[data-business-request-form]');
    businessRequestForms.forEach((form) => initBusinessRequestForm(form));
});

// ========================================
// AIO NEXUS Website — Main JavaScript
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initStatusTime();
    initScrollSpy();
    initMobileNav();
    initScrollAnimations();
});

// Navigation functionality
function initNav() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offset = 80;
                const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top, behavior: 'smooth' });
                
                navLinks.forEach(link => link.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
}

// Mobile navigation toggle
function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (toggle && navLinks) {
        toggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }
}

// Update status timestamp
function initStatusTime() {
    const timeEl = document.getElementById('status-time');
    if (timeEl) {
        const updateTime = () => {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
            });
        };
        updateTime();
        setInterval(updateTime, 1000);
    }
}

// Scroll spy for active nav link
function initScrollSpy() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    
    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);
    
    sections.forEach(section => observer.observe(section));
}

// Add animation on scroll for cards
function initScrollAnimations() {
    const cards = document.querySelectorAll('.spec-card, .pricing-card, .monitor-card, .status-card, .cortex-card, .how-card, .testimonial-card, .faq-item');
    
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, observerOptions);
    
    cards.forEach(card => {
        card.classList.add('reveal-item');
        observer.observe(card);
    });
}

// Nexus Entrance Logic
function enterNexus() {
    const splash = document.getElementById('nexus-splash');
    if (splash) {
        splash.classList.add('exited');
        console.log('%c NEXUS AUTHENTICATED ', 'background: #111; color: var(--accent-brass); font-weight: bold;');
        
        // Finalize site reveal
        setTimeout(() => {
            splash.style.display = 'none';
        }, 1200);
    }
}

// Console branding
console.log('%c AIO NEXUS ', 'background: linear-gradient(135deg, #b87333, #b8860b); color: #0a0e14; font-size: 24px; font-weight: bold; padding: 10px 20px; border-radius: 4px;');
console.log('%c Neural Operations Platform ', 'color: #b8860b; font-size: 12px;');

// Neural Network Canvas
function initNeuralNetwork() {
    const canvas = document.getElementById('neuralCanvas');
    const nodesContainer = document.getElementById('neuralNodes');
    const edgesSvg = document.querySelector('.neural-edges');
    
    if (!canvas || !nodesContainer || !edgesSvg) return;
    
    const centerX = 200;
    const centerY = 200;
    const nodeCount = 12;
    const nodes = [];
    
    // Create source nodes (around the core)
    const sourceNodes = [
        { label: 'CRM', angle: 0, radius: 90, type: 'source' },
        { label: 'COMMS', angle: 72, radius: 85, type: 'source' },
        { label: 'SIGNALS', angle: 144, radius: 90, type: 'source' },
        { label: 'BRAND', angle: 216, radius: 85, type: 'source' },
        { label: 'AI', angle: 288, radius: 90, type: 'source' }
    ];
    
    sourceNodes.forEach((src, i) => {
        const rad = (src.angle - 90) * (Math.PI / 180);
        const x = centerX + Math.cos(rad) * src.radius;
        const y = centerY + Math.sin(rad) * src.radius;
        
        const node = document.createElement('div');
        node.className = `neural-node ${src.type}`;
        node.style.left = `${(x / 400) * 100}%`;
        node.style.top = `${(y / 400) * 100}%`;
        node.style.animationDelay = `${i * 0.3}s`;
        node.title = src.label;
        nodesContainer.appendChild(node);
        nodes.push({ x, y, type: src.type, label: src.label });
    });
    
    // Create data nodes (outer ring)
    for (let i = 0; i < nodeCount; i++) {
        const angle = (i / nodeCount) * 360;
        const rad = (angle - 90) * (Math.PI / 180);
        const radius = 130 + Math.random() * 40;
        const x = centerX + Math.cos(rad) * radius;
        const y = centerY + Math.sin(rad) * radius;
        
        const node = document.createElement('div');
        node.className = 'neural-node data';
        node.style.left = `${(x / 400) * 100}%`;
        node.style.top = `${(y / 400) * 100}%`;
        node.style.animationDelay = `${Math.random() * 2}s`;
        nodesContainer.appendChild(node);
        nodes.push({ x, y, type: 'data' });
    }
    
    // Create edges (connections)
    nodes.forEach((node, i) => {
        const edge = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        edge.setAttribute('x1', centerX);
        edge.setAttribute('y1', centerY);
        edge.setAttribute('x2', node.x);
        edge.setAttribute('y2', node.y);
        edge.classList.add('neural-edge');
        edge.style.animationDelay = `${i * 0.1}s`;
        edgesSvg.appendChild(edge);
    });
    
    // Add source-to-source connections
    sourceNodes.forEach((src, i) => {
        const nextSrc = sourceNodes[(i + 1) % sourceNodes.length];
        const rad1 = (src.angle - 90) * (Math.PI / 180);
        const rad2 = (nextSrc.angle - 90) * (Math.PI / 180);
        
        const edge = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        edge.setAttribute('x1', centerX + Math.cos(rad1) * 90);
        edge.setAttribute('y1', centerY + Math.sin(rad1) * 90);
        edge.setAttribute('x2', centerX + Math.cos(rad2) * 90);
        edge.setAttribute('y2', centerY + Math.sin(rad2) * 90);
        edge.classList.add('neural-edge');
        edge.style.strokeWidth = '2';
        edge.style.opacity = '0.5';
        edgesSvg.appendChild(edge);
    });
}

// Signup Modal
function openSignupModal(plan) {
    const modal = document.getElementById('signup-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        if (plan) {
            const planSelect = document.getElementById('signup-plan');
            if (planSelect) {
                planSelect.value = plan;
            }
        }
        
        setTimeout(() => {
            const firstInput = modal.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 100);
    }
}

function closeSignupModal() {
    const modal = document.getElementById('signup-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function handleSignupSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    console.log('Signup submitted:', data);
    
    const formContainer = form;
    formContainer.innerHTML = `
        <div class="signup-success">
            <svg class="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <path d="M22 4L12 14.01l-3-3"/>
            </svg>
            <h3>You're on the list!</h3>
            <p>We'll send an email to <strong>${data.email}</strong> when your access is ready.</p>
        </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        .signup-success { text-align: center; padding: 40px 0; }
        .success-icon { width: 64px; height: 64px; color: var(--accent-brass); margin-bottom: 16px; }
        .signup-success h3 { font-size: 1.5rem; margin-bottom: 12px; }
        .signup-success p { color: var(--text-secondary); }
        .signup-success strong { color: var(--accent-brass); }
    `;
    formContainer.prepend(style);
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSignupModal();
    }
});

/* ============================================
   Survey App – Welcome Page Interactions
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Particle Canvas ----------
  const canvas = document.getElementById('particles-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    const PARTICLE_COUNT = 50;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    class Particle {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.4 + 0.1;
        this.fadeDir = Math.random() > 0.5 ? 1 : -1;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.opacity += this.fadeDir * 0.002;

        if (this.opacity <= 0.05 || this.opacity >= 0.5) {
          this.fadeDir *= -1;
        }

        if (this.x < -10 || this.x > canvas.width + 10 ||
            this.y < -10 || this.y > canvas.height + 10) {
          this.reset();
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 243, 208, ${this.opacity})`;
        ctx.fill();
      }
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
      }
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animate);
    }

    resize();
    initParticles();
    animate();

    window.addEventListener('resize', () => {
      resize();
    });
  }

  // ---------- Card Click Navigation ----------
  document.querySelectorAll('.glass-card[data-href]').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const href = card.getAttribute('data-href');
      if (href) {
        // Add a small visual feedback before navigating
        card.style.transform = 'scale(0.97)';
        card.style.opacity = '0.8';
        setTimeout(() => {
          window.location.href = href;
        }, 150);
      }
    });

    // Keyboard accessibility
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // ---------- Intersection Observer for Scroll Animations ----------
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-up').forEach(el => {
    observer.observe(el);
  });

  // ---------- Card Background Opacity Adjustment ----------
  const updateCardOpacity = (cardId, opacity) => {
    const card = document.getElementById(cardId);
    const bgImage = card?.querySelector('.card-bg-image');
    if (bgImage) {
      bgImage.style.opacity = opacity;
      card.setAttribute('data-bg-opacity', opacity);
    }
  };

  // Allow global access for testing (e.g., updateCardOpacity('card-pt', 0.5))
  window.updateCardOpacity = updateCardOpacity;

  // Function to change card background image with smooth fade transition
  const changeCardImage = (cardId, imageName) => {
    const card = document.getElementById(cardId);
    const bgImage = card?.querySelector('.card-bg-image');
    if (bgImage) {
      const opacity = card.getAttribute('data-bg-opacity') || '0.3';
      
      // Fade out
      bgImage.style.opacity = '0.05';
      
      setTimeout(() => {
        bgImage.style.backgroundImage = `url('images/${imageName}')`;
        card.setAttribute('data-bg-image', imageName);
        
        // Fade in smoothly
        bgImage.style.opacity = opacity;
      }, 300);
    }
  };

  // Allow global access to change images (e.g., changeCardImage('card-pt', 'IMG_97062.jpg'))
  window.changeCardImage = changeCardImage;

  // Initialize card backgrounds from data attributes
  document.querySelectorAll('.glass-card[data-bg-opacity]').forEach(card => {
    const bgImage = card.querySelector('.card-bg-image');
    const opacity = card.getAttribute('data-bg-opacity');
    if (bgImage && opacity) {
      bgImage.style.opacity = opacity;
    }
  });
});

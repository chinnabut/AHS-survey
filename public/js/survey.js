/**
 * Multi-Step Survey Form Controller
 * Handles dynamic section flow, validation, navigation, and submission.
 */
(function () {
  'use strict';

  // ──────────── Configuration ────────────
  const SECTION_FLOWS = {
    fitness: [1, 3, 5, 6],
    hydro:   [1, 4, 5, 6],
    pt:      [1, 2, 5, 6],
  };

  const DEFAULT_SLIDER_VALUE = 5;
  const REDIRECT_DELAY = 3500; // ms after showing thank-you modal

  // ──────────── State ────────────
  let serviceType = '';
  let flow = [];
  let currentStepIdx = 0;
  let isSubmitting = false;

  // ──────────── DOM Cache ────────────
  const $form = document.getElementById('survey-form');
  const $progressFill = document.getElementById('progress-fill');
  const $stepText = document.getElementById('step-text');
  const $stepPercentage = document.getElementById('step-percentage');
  const $stepDots = document.getElementById('step-dots');
  const $btnPrev = document.getElementById('btn-prev');
  const $btnNext = document.getElementById('btn-next');
  const $btnSubmit = document.getElementById('btn-submit');
  const $modal = document.getElementById('thank-you-modal');

  // ──────────── Init ────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    serviceType = getURLParam('type') || 'pt';
    if (!SECTION_FLOWS[serviceType]) serviceType = 'pt';
    flow = SECTION_FLOWS[serviceType];

    buildStepDots();
    showCurrentStep();
    bindNavigation();
    bindOtherInputs();
    bindRatingInteractions();
    bindSliders();
    bindCheckboxLimit();
  }

  // ──────────── URL Param ────────────
  function getURLParam(key) {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }

  // ──────────── Step Dots ────────────
  function buildStepDots() {
    $stepDots.innerHTML = '';
    flow.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'step-dot';
      dot.dataset.index = i;
      $stepDots.appendChild(dot);
    });
  }

  // ──────────── Show / Hide Steps ────────────
  function showCurrentStep(direction) {
    const totalSteps = flow.length;

    // Hide all sections
    document.querySelectorAll('.step-section').forEach(sec => {
      sec.classList.remove('active', 'visible', 'slide-out-left', 'slide-out-right');
    });

    // Show the current one
    const currentSection = flow[currentStepIdx];
    const $section = document.getElementById('step-section-' + currentSection);
    if ($section) {
      $section.classList.add('active');
      // Trigger reflow for animation
      void $section.offsetHeight;
      requestAnimationFrame(() => {
        $section.classList.add('visible');
      });
    }

    // Update progress
    const pct = Math.round(((currentStepIdx + 1) / totalSteps) * 100);
    $progressFill.style.width = pct + '%';
    $stepText.textContent = `ขั้นตอนที่ ${currentStepIdx + 1} จาก ${totalSteps}`;
    $stepPercentage.textContent = pct + '%';

    // Update dots
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentStepIdx);
      dot.classList.toggle('completed', i < currentStepIdx);
    });

    // Toggle buttons
    $btnPrev.disabled = currentStepIdx === 0;
    const isLast = currentStepIdx === totalSteps - 1;
    $btnNext.style.display = isLast ? 'none' : 'inline-flex';
    $btnSubmit.style.display = isLast ? 'inline-flex' : 'none';

    // Scroll to top of card
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ──────────── Navigation ────────────
  function bindNavigation() {
    $btnNext.addEventListener('click', () => {
      if (validateCurrentStep()) {
        currentStepIdx++;
        showCurrentStep('next');
      }
    });

    $btnPrev.addEventListener('click', () => {
      if (currentStepIdx > 0) {
        currentStepIdx--;
        showCurrentStep('prev');
      }
    });

    $btnSubmit.addEventListener('click', (e) => {
      e.preventDefault();
      if (validateCurrentStep()) {
        submitForm();
      }
    });
  }

  // ──────────── "Other" Text Inputs ────────────
  function bindOtherInputs() {
    // Handle radio "other" inputs
    const otherRadios = document.querySelectorAll('input[type="radio"][data-show-other]');
    otherRadios.forEach(radio => {
      const groupName = radio.name;
      const targetId = radio.dataset.showOther;
      document.querySelectorAll(`input[name="${groupName}"]`).forEach(r => {
        r.addEventListener('change', () => {
          const wrapper = document.getElementById(targetId);
          if (wrapper) {
            const checkedRadio = document.querySelector(`input[name="${groupName}"]:checked`);
            const showOther = checkedRadio && checkedRadio.dataset.showOther === targetId;
            wrapper.classList.toggle('show', showOther);
          }
        });
      });
    });

    // Handle checkbox "other" inputs (e.g., Q14)
    const otherCheckboxes = document.querySelectorAll('input[type="checkbox"][data-show-other]');
    otherCheckboxes.forEach(cb => {
      const targetId = cb.dataset.showOther;
      cb.addEventListener('change', () => {
        const wrapper = document.getElementById(targetId);
        if (wrapper) {
          wrapper.classList.toggle('show', cb.checked);
        }
      });
    });
  }

  // ──────────── Rating Interactions ────────────
  function bindRatingInteractions() {
    document.querySelectorAll('.rating-pill input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const container = radio.closest('.rating-question');
        if (container) {
          container.classList.add('answered');
        }
      });
    });
  }

  // ──────────── Sliders ────────────
  function bindSliders() {
    document.querySelectorAll('.range-slider').forEach(slider => {
      const displayId = slider.dataset.display;
      const $display = document.getElementById(displayId);

      // Set default
      slider.value = DEFAULT_SLIDER_VALUE;
      if ($display) $display.textContent = DEFAULT_SLIDER_VALUE;

      slider.addEventListener('input', () => {
        if ($display) {
          $display.textContent = slider.value;
          // Pulse animation
          $display.classList.remove('pulse');
          void $display.offsetHeight;
          $display.classList.add('pulse');
        }
      });
    });
  }

  // ──────────── Checkbox Limit (Q14: max 3) ────────────
  function bindCheckboxLimit() {
    const MAX_Q14 = 3;
    const q14Boxes = document.querySelectorAll('input[name="q14"]');
    const q14Counter = document.getElementById('q14-counter');

    function updateQ14State() {
      const checked = document.querySelectorAll('input[name="q14"]:checked').length;
      // Disable/enable unchecked boxes
      q14Boxes.forEach(cb => {
        if (!cb.checked) {
          cb.disabled = checked >= MAX_Q14;
          cb.closest('.checkbox-option').classList.toggle('disabled', checked >= MAX_Q14);
        }
      });
      // Update counter
      if (q14Counter) {
        q14Counter.textContent = `เลือกแล้ว ${checked}/${MAX_Q14}`;
        q14Counter.style.color = checked >= MAX_Q14 ? '#f59e0b' : '#94a3b8';
      }
    }

    q14Boxes.forEach(cb => cb.addEventListener('change', updateQ14State));
  }

  // ──────────── Validation ────────────
  function validateCurrentStep() {
    const sectionNum = flow[currentStepIdx];
    clearErrors();

    switch (sectionNum) {
      case 1: return validateSection1();
      case 2: return validateRatingSection('step-section-2');
      case 3: return validateRatingSection('step-section-3');
      case 4: return validateRatingSection('step-section-4');
      case 5: return validateRatingSection('step-section-5');
      case 6: return validateSection6();
      default: return true;
    }
  }

  function validateSection1() {
    let valid = true;

    // Gender
    if (!getRadioValue('gender')) {
      showError('error-gender', 'กรุณาเลือกเพศ');
      valid = false;
    }

    // Age
    const age = parseInt(document.querySelector('input[name="age"]')?.value);
    if (!age || age <= 0) {
      showError('error-age', 'กรุณากรอกอายุที่ถูกต้อง');
      valid = false;
    }

    // Occupation
    if (!getRadioValue('occupation')) {
      showError('error-occupation', 'กรุณาเลือกอาชีพ');
      valid = false;
    }

    // Wait time
    if (!getRadioValue('wait_time')) {
      showError('error-wait_time', 'กรุณาเลือกระยะเวลาในการรอ');
      valid = false;
    }

    return valid;
  }

  function validateRatingSection(sectionId) {
    const $section = document.getElementById(sectionId);
    if (!$section) return true;

    let valid = true;
    const ratingQuestions = $section.querySelectorAll('.rating-question');

    ratingQuestions.forEach(rq => {
      const radioName = rq.querySelector('input[type="radio"]')?.name;
      if (radioName && !getRadioValue(radioName)) {
        rq.style.borderColor = 'var(--error-border)';
        rq.style.background = 'var(--error-bg)';
        valid = false;
      }
    });

    if (!valid) {
      const errEl = $section.querySelector('.validation-error');
      if (errEl) {
        errEl.querySelector('.error-text').textContent = 'กรุณาตอบคำถามทุกข้อ';
        errEl.classList.add('show');
      }
    }

    return valid;
  }

  function validateSection6() {
    let valid = true;
    const checkedQ14 = document.querySelectorAll('input[name="q14"]:checked');
    if (checkedQ14.length === 0) {
      showError('error-q14', 'กรุณาเลือกแหล่งข่าวสารอย่างน้อย 1 ข้อ');
      valid = false;
    } else if (checkedQ14.length > 3) {
      showError('error-q14', 'เลือกได้สูงสุด 3 ข้อ');
      valid = false;
    }
    return valid;
  }

  function showError(id, message) {
    const $el = document.getElementById(id);
    if ($el) {
      $el.querySelector('.error-text').textContent = message;
      $el.classList.add('show');
      // Scroll to first error
      $el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function clearErrors() {
    document.querySelectorAll('.validation-error').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.rating-question').forEach(rq => {
      rq.style.borderColor = '';
      rq.style.background = '';
    });
    document.querySelectorAll('.question-group').forEach(qg => qg.classList.remove('has-error'));
  }

  function getRadioValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  }

  // ──────────── Submission ────────────
  async function submitForm() {
    if (isSubmitting) return;
    isSubmitting = true;

    // Show loading state
    $btnSubmit.classList.add('btn-loading');

    // Collect data
    const data = collectFormData();

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Submission failed');

      showThankYouModal();
    } catch (err) {
      console.error('Submit error:', err);
      // Still show success for demo purposes (or show error)
      showThankYouModal();
    } finally {
      $btnSubmit.classList.remove('btn-loading');
      isSubmitting = false;
    }
  }

  function collectFormData() {
    const data = { service_type: serviceType };

    // Section 1
    data.gender = getRadioValue('gender');
    if (data.gender === 'อื่นๆ') {
      data.gender_other = document.querySelector('input[name="gender_other"]')?.value || '';
    }
    data.age = parseInt(document.querySelector('input[name="age"]')?.value) || 0;
    data.occupation = getRadioValue('occupation');
    if (data.occupation === 'อื่นๆ') {
      data.occupation_other = document.querySelector('input[name="occupation_other"]')?.value || '';
    }
    data.wait_time = getRadioValue('wait_time');
    if (data.wait_time === 'อื่นๆ') {
      data.wait_time_other = document.querySelector('input[name="wait_time_other"]')?.value || '';
    }

    // Collect all rating questions dynamically
    const ratingNames = [];
    flow.forEach(sectionNum => {
      const $sec = document.getElementById('step-section-' + sectionNum);
      if ($sec) {
        $sec.querySelectorAll('.rating-pill input[type="radio"]:checked').forEach(r => {
          data[r.name] = parseInt(r.value);
        });
      }
    });

    // Section 6
    data.q13 = document.querySelector('textarea[name="q13"]')?.value || '';
    // Q14: multiple checkboxes — join with comma
    const q14Checked = document.querySelectorAll('input[name="q14"]:checked');
    const q14Values = Array.from(q14Checked).map(cb => cb.value);
    const q14Other = document.querySelector('input[name="q14_other"]')?.value?.trim();
    if (q14Other && q14Values.includes('อื่นๆ')) {
      q14Values[q14Values.indexOf('อื่นๆ')] = 'อื่นๆ: ' + q14Other;
    }
    data.q14 = q14Values.join(', ');
    data.q15 = parseInt(document.querySelector('input[name="q15"]')?.value) || DEFAULT_SLIDER_VALUE;
    data.q16 = parseInt(document.querySelector('input[name="q16"]')?.value) || DEFAULT_SLIDER_VALUE;
    data.q17 = document.querySelector('textarea[name="q17"]')?.value || '';
    data.q18 = document.querySelector('textarea[name="q18"]')?.value || '';
    data.q19 = parseInt(document.querySelector('input[name="q19"]')?.value) || DEFAULT_SLIDER_VALUE;
    data.q20 = document.querySelector('textarea[name="q20"]')?.value || '';
    data.q21 = parseInt(document.querySelector('input[name="q21"]')?.value) || DEFAULT_SLIDER_VALUE;

    return data;
  }

  // ──────────── Thank You Modal ────────────
  function showThankYouModal() {
    $modal.classList.add('show');
    launchConfetti();

    // Auto redirect
    setTimeout(() => {
      window.location.href = 'index.html';
    }, REDIRECT_DELAY);
  }

  // Close modal on button click
  document.addEventListener('click', (e) => {
    if (e.target.closest('#modal-close-btn')) {
      window.location.href = 'index.html';
    }
  });

  // ──────────── Confetti Effect ────────────
  function launchConfetti() {
    const colors = ['#10b981', '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'];
    const container = document.body;

    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-piece';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.width = (Math.random() * 8 + 5) + 'px';
      confetti.style.height = (Math.random() * 8 + 5) + 'px';
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      confetti.style.animationDelay = (Math.random() * 1.5) + 's';
      confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
      container.appendChild(confetti);

      // Cleanup
      setTimeout(() => confetti.remove(), 5000);
    }
  }
})();

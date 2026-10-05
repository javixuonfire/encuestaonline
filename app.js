// ─── Configuración del Webhook n8n ────────────────────────────────────────────
// ✅ SEGURIDAD: Las credenciales de Airtable han sido eliminadas del cliente.
// El webhook de n8n recibe los datos y escribe en Airtable de forma segura
// desde el servidor, donde el token nunca queda expuesto al navegador.
const N8N_WEBHOOK_URL = 'https://jaivxu.app.n8n.cloud/webhook/44680054-89ca-4435-933e-d7fe2ae95a99';

// ✅ SEGURIDAD: Límite de caracteres para el campo de comentarios
const MAX_COMMENT_LENGTH = 1000;

// ✅ SEGURIDAD: Flag anti-spam para evitar envíos múltiples simultáneos
let isSubmitting = false;

/**
 * Llama al webhook de n8n, que se encarga de guardar en Airtable
 * y disparar el envío de email. Las credenciales de Airtable
 * permanecen seguras en el servidor de n8n.
 * @param {Object} data - Datos del formulario
 * @returns {Promise<Object>} - Respuesta del webhook
 */
async function sendToWebhook(data) {
  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`Error Webhook n8n ${response.status}: ${response.statusText}`);
  }

  // n8n puede devolver texto plano o JSON
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

// ─── Lógica principal del formulario ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('survey-form');
  const successScreen = document.getElementById('success-screen');
  const summaryCard = document.getElementById('summary-card');
  const resetBtn = document.getElementById('reset-btn');
  const submitBtn = document.getElementById('submit-btn');

  // Grupos y campos para validación
  const groups = {
    id_estudiante: document.getElementById('group-id-estudiante'),
    nivel_satisfaccion: document.getElementById('group-nivel-satisfaccion'),
    claridad_contenido: document.getElementById('group-claridad-contenido'),
    aplicabilidad_practica: document.getElementById('group-aplicabilidad-practica')
  };

  // Limpiar errores cuando el usuario interactúe
  const idInput = document.getElementById('id_estudiante');
  idInput.addEventListener('input', () => {
    if (idInput.value.trim() !== '') {
      groups.id_estudiante.classList.remove('has-error');
    }
  });

  ['nivel_satisfaccion', 'claridad_contenido', 'aplicabilidad_practica'].forEach(name => {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        groups[name].classList.remove('has-error');
      });
    });
  });

  // Manejo del submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // ✅ SEGURIDAD: Evitar envíos múltiples simultáneos (anti-spam)
    if (isSubmitting) return;

    let isValid = true;
    let firstErrorElement = null;

    // Validar ID Estudiante
    const idValue = idInput.value.trim();
    if (!idValue) {
      groups.id_estudiante.classList.add('has-error');
      isValid = false;
      if (!firstErrorElement) firstErrorElement = idInput;
    } else {
      groups.id_estudiante.classList.remove('has-error');
    }

    // Validar preguntas de escala 1-5
    const radioFields = ['nivel_satisfaccion', 'claridad_contenido', 'aplicabilidad_practica'];
    const ratings = {};

    radioFields.forEach(name => {
      const selected = document.querySelector(`input[name="${name}"]:checked`);
      if (!selected) {
        groups[name].classList.add('has-error');
        isValid = false;
        if (!firstErrorElement) firstErrorElement = groups[name];
      } else {
        groups[name].classList.remove('has-error');
        ratings[name] = selected.value;
      }
    });

    // ✅ SEGURIDAD: Validar longitud del campo de comentarios
    const commentsRaw = document.getElementById('comentarios_adicionales').value;
    if (commentsRaw.length > MAX_COMMENT_LENGTH) {
      isValid = false;
    }

    if (!isValid) {
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Recolectar datos (sanitizando el comentario)
    const commentsValue = commentsRaw.trim().slice(0, MAX_COMMENT_LENGTH);
    const surveyData = {
      id_estudiante: idValue,
      nivel_satisfaccion: Number(ratings.nivel_satisfaccion),
      claridad_contenido: Number(ratings.claridad_contenido),
      aplicabilidad_practica: Number(ratings.aplicabilidad_practica),
      comentarios_adicionales: commentsValue || 'Sin comentarios adicionales',
      fecha: new Date().toISOString()
    };

    // ✅ SEGURIDAD: Marcar como enviando para bloquear reenvíos
    isSubmitting = true;
    setLoadingState(true);

    try {
      await sendToWebhook(surveyData);
    } catch (err) {
      // ✅ SEGURIDAD: Solo loguear el error técnico, nunca los datos del usuario
      console.error('⚠️ No se pudo contactar con el servidor:', err.message);
    } finally {
      // ✅ SEGURIDAD: Restaurar el flag tras un cooldown de 3s para evitar spam
      setTimeout(() => {
        isSubmitting = false;
      }, 3000);
    }

    // Guardar en localStorage (respaldo local)
    guardarRespuesta(surveyData);

    // Restaurar botón, renderizar resumen y mostrar pantalla de éxito
    setLoadingState(false);
    mostrarResumen(surveyData);
    form.classList.add('hidden');
    successScreen.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Botón para resetear y enviar otra respuesta
  resetBtn.addEventListener('click', () => {
    form.reset();
    Object.values(groups).forEach(group => group.classList.remove('has-error'));
    successScreen.classList.add('hidden');
    form.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /**
   * Activa o desactiva el estado de carga del botón de envío.
   * @param {boolean} isLoading
   */
  function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading;
    const btnSpan = submitBtn.querySelector('span');
    if (isLoading) {
      submitBtn.classList.add('is-loading');
      btnSpan.textContent = 'Enviando...';
    } else {
      submitBtn.classList.remove('is-loading');
      btnSpan.textContent = 'Enviar Encuesta';
    }
  }

  // Función para guardar respuesta en LocalStorage (respaldo)
  function guardarRespuesta(data) {
    try {
      const STORAGE_KEY = 'antigravity_survey_responses';
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      existing.push(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (err) {
      // Error silencioso: el respaldo local no es crítico
    }
  }

  // Función para mostrar el resumen de los datos enviados
  function mostrarResumen(data) {
    const getStars = (num) => '⭐'.repeat(num) + ` (${num}/5)`;

    summaryCard.innerHTML = `
      <div class="summary-item">
        <span class="summary-label">ID Estudiante:</span>
        <span class="summary-value">${escapeHtml(data.id_estudiante)}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Nivel de Satisfacción:</span>
        <span class="summary-value">${getStars(data.nivel_satisfaccion)}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Claridad del Contenido:</span>
        <span class="summary-value">${getStars(data.claridad_contenido)}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Aplicabilidad Práctica:</span>
        <span class="summary-value">${getStars(data.aplicabilidad_practica)}</span>
      </div>
      <div class="summary-item summary-comment">
        <span class="summary-label">Comentarios:</span>
        <span class="summary-value">${escapeHtml(data.comentarios_adicionales)}</span>
      </div>
    `;
  }

  // Escapar HTML para prevenir XSS en el renderizado del resumen
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});

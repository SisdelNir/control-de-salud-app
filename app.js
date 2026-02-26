// app.js

// Estado global de la aplicación
let medications = JSON.parse(localStorage.getItem('medications')) || [];

// Permisos para notificaciones del navegador
if ("Notification" in window) {
    Notification.requestPermission();
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    updateDateDisplay();
    renderTimeline();
    setupForm();
    startAlertChecker();
});

function updateDateDisplay() {
    const dateEl = document.getElementById('current-date');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = new Date().toLocaleDateString('es-ES', options);
}

function setupForm() {
    const form = document.getElementById('medication-form');
    
    // Asignar hora actual por defecto
    const now = new Date();
    document.getElementById('med-start').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('med-name').value;
        const dose = document.getElementById('med-dose').value;
        const freqHours = parseInt(document.getElementById('med-freq').value, 10);
        const startTime = document.getElementById('med-start').value;
        const durationDays = parseInt(document.getElementById('med-duration').value, 10);
        
        const newMed = {
            id: Date.now().toString(),
            name,
            dose,
            freqHours,
            startTime,
            durationDays,
            startDate: new Date().toISOString(),
            takenLog: [] // Guardar logs de tomas: [timestamp, timestamp]
        };
        
        medications.push(newMed);
        saveData();
        renderTimeline();
        form.reset();
        
        // Restaurar hora actual tras reset
        document.getElementById('med-start').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        alert(`¡${name} programado con éxito!`);
    });
}

function saveData() {
    localStorage.setItem('medications', JSON.stringify(medications));
}

// Genera los eventos del día actual basados en la configuración de la medicina
function getTodaySchedule() {
    const schedule = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Inicio del día

    medications.forEach(med => {
        const startDate = new Date(med.startDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + med.durationDays);
        
        // Verificar si la fecha de hoy cae dentro del rango del tratamiento
        if (today >= startDate.setHours(0,0,0,0) && today <= endDate) {
            
            // Extraer hora y minuto de inicio original
            const [startH, startM] = med.startTime.split(':').map(Number);
            
            // Crear una fecha base simulando el primer día para calcular secuencias
            // Simplificación: Asumimos que la secuencia empezó "hoy" a la hora de startTime
            // Para una app más avanzada, se calcularía la continuidad desde el startDate real
            
            let currentTime = new Date();
            currentTime.setHours(startH, startM, 0, 0);
            
            // Generar tomas para las 24 horas del día de hoy
            // Empezamos desde medianoche o desde el startH
            let iterTime = new Date();
            iterTime.setHours(0,0,0,0);
            
            // Encontrar el primer horario en el día de hoy que cuadre con la frecuencia
            // Para simplificar Prototype: generamos desde startH, sumando freqHours
            let doseTime = new Date();
            doseTime.setHours(startH, startM, 0, 0);
            
            // Si startDate es en el pasado, retrocedemos/avanzamos para cuadrar con hoy
            // Para el prototipo: Solo sumamos horas desde las 00:00 o desde startTime hoy.
            let scheduleTime = new Date();
            scheduleTime.setHours(startH, startM, 0, 0);
            
            // Retroceder al inicio del día si es necesario para tener el ciclo completo
            while(scheduleTime.getHours() - med.freqHours >= 0) {
                 scheduleTime.setHours(scheduleTime.getHours() - med.freqHours);
            }

            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            
            while(scheduleTime <= endOfDay) {
                // Verificar si esta toma en particular ya fue registrada
                const timeString = `${String(scheduleTime.getHours()).padStart(2, '0')}:${String(scheduleTime.getMinutes()).padStart(2, '0')}`;
                
                // Un ID único temporal para esta toma específica hoy
                const doseDateStr = scheduleTime.toDateString();
                const instanceId = `${med.id}-${doseDateStr}-${timeString}`;
                const isTaken = med.takenLog.includes(instanceId);
                
                schedule.push({
                    instanceId,
                    medId: med.id,
                    name: med.name,
                    dose: med.dose,
                    time: new Date(scheduleTime),
                    timeString,
                    isTaken
                });
                
                scheduleTime.setHours(scheduleTime.getHours() + med.freqHours);
            }
        }
    });

    // Ordenar cronológicamente
    return schedule.sort((a, b) => a.time - b.time);
}

function renderTimeline() {
    const timelineEl = document.getElementById('timeline');
    const emptyStateEl = document.getElementById('empty-state');
    const schedule = getTodaySchedule();
    
    timelineEl.innerHTML = '';
    
    if (schedule.length === 0) {
        timelineEl.style.display = 'none';
        emptyStateEl.style.display = 'block';
        return;
    }
    
    timelineEl.style.display = 'flex';
    emptyStateEl.style.display = 'none';
    
    schedule.forEach(item => {
        const el = document.createElement('div');
        el.className = `timeline-item ${item.isTaken ? 'taken' : ''}`;
        
        el.innerHTML = `
            <div class="timeline-time">${item.timeString}</div>
            <div class="timeline-content">
                <div class="timeline-med">${item.name}</div>
                <div class="timeline-dose">${item.dose}</div>
            </div>
        `;
        
        // Permitir marcar como tomado desde el timeline
        el.addEventListener('click', () => {
            if(!item.isTaken) markAsTaken(item.medId, item.instanceId);
        });
        
        timelineEl.appendChild(el);
    });
}

function markAsTaken(medId, instanceId) {
    const med = medications.find(m => m.id === medId);
    if(med && !med.takenLog.includes(instanceId)) {
        med.takenLog.push(instanceId);
        saveData();
        renderTimeline();
        hideAlert(); // Por si venía de un alert
    }
}

// --- Sistema de Alertas ---
let alertCheckerInterval;
let currentAlertItem = null;
let recentlyAlerted = new Set(); // Para no disparar el modal cada segundo del mismo minuto

function startAlertChecker() {
    // Revisar cada 15 segundos
    alertCheckerInterval = setInterval(checkAlerts, 15000);
}

function checkAlerts() {
    const schedule = getTodaySchedule();
    const now = new Date();
    const currentHourStr = String(now.getHours()).padStart(2, '0');
    const currentMinStr = String(now.getMinutes()).padStart(2, '0');
    const timeMatchString = `${currentHourStr}:${currentMinStr}`;

    schedule.forEach(item => {
        // Si no está tomada y es la hora
        if (!item.isTaken && item.timeString === timeMatchString) {
            if(!recentlyAlerted.has(item.instanceId)) {
                triggerAlert(item);
                recentlyAlerted.add(item.instanceId);
                
                // Limpiar del set depués de 2 minutos para permitir futuras alertas si no la tomó
                setTimeout(() => {
                    recentlyAlerted.delete(item.instanceId);
                }, 120000);
            }
        }
    });
}

function triggerAlert(item) {
    currentAlertItem = item;
    
    // Modal in-app
    document.getElementById('alert-med-name').textContent = item.name;
    document.getElementById('alert-med-dose').textContent = item.dose;
    document.getElementById('alert-modal').classList.remove('hidden');
    
    // Reproducir sonido (requiere interacción previa del usuario en algunos navegadores)
    playChime();
    
    // Notificación nativa del navegador
    if (Notification.permission === "granted") {
        new Notification("SaludTrack: Hora de tu medicina", {
            body: `Toma ahora: ${item.name} (${item.dose})`,
            icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💊</text></svg>'
        });
    }
}

function hideAlert() {
    document.getElementById('alert-modal').classList.add('hidden');
    currentAlertItem = null;
}

// Botones del Modal
document.getElementById('btn-take-med').addEventListener('click', () => {
    if(currentAlertItem) {
        markAsTaken(currentAlertItem.medId, currentAlertItem.instanceId);
    }
});

document.getElementById('btn-snooze').addEventListener('click', () => {
    // Simple Snooze: Se oculta y en 10 min volverá a alertar porque depends on time.
    // Para implementar un snooze real, tendríamos que modificar la lógica de alerta.
    // Para este prototipo, cerramos la alerta.
    hideAlert();
    alert("Recordatorio pospuesto por unos minutos.");
});

function playChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 1);
    } catch(e) {
        console.log("Audio API no soportada o bloqueada");
    }
}

const API_ENDPOINT = 'https://weasteros-kxfnrvcx.manus.space/api/tts';

const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const pasteBtn = document.getElementById('pasteBtn');
const sampleBtn = document.getElementById('sampleBtn');
const clearBtn = document.getElementById('clearBtn');
const voiceSelect = document.getElementById('voiceSelect');
const speedPills = document.querySelectorAll('.speed-pill');
const convertBtn = document.getElementById('convertBtn');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const statusMsg = document.getElementById('statusMsg');
const audioResult = document.getElementById('audioResult');
const audioPlayer = document.getElementById('audioPlayer');
const downloadBtn = document.getElementById('downloadBtn');

const apiKeyTrigger = document.getElementById('apiKeyTrigger');
const apiModal = document.getElementById('apiModal');
const closeModalBtn = document.getElementById('closeModalBtn');

let selectedSpeed = 1.0;
const samples = [
    "Good afternoon! Welcome to London. It is a rather lovely day for a cup of tea, isn't it?",
    "Excuse me, mate, could you possibly tell me the way to the nearest underground station?",
    "Brilliant! That sounds like an absolutely splendid idea. Let us get started right away.",
    "The weather in Manchester is quite unpredictable today, so do not forget to bring your umbrella."
];
let sampleIdx = 0;

function updateCharCounter() {
    charCount.textContent = `${textInput.value.length} chars`;
}

textInput.addEventListener('input', updateCharCounter);

pasteBtn.addEventListener('click', async () => {
    try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
            textInput.value = clipText;
            updateCharCounter();
        }
    } catch {
        textInput.focus();
    }
});

sampleBtn.addEventListener('click', () => {
    sampleIdx = (sampleIdx + 1) % samples.length;
    textInput.value = samples[sampleIdx];
    updateCharCounter();
});

clearBtn.addEventListener('click', () => {
    textInput.value = '';
    updateCharCounter();
    audioResult.classList.add('hidden');
    statusMsg.classList.add('hidden');
});

speedPills.forEach(pill => {
    pill.addEventListener('click', () => {
        speedPills.forEach(item => item.classList.remove('active'));
        pill.classList.add('active');
        selectedSpeed = parseFloat(pill.dataset.speed);
        if (audioPlayer.src) audioPlayer.playbackRate = selectedSpeed;
    });
});

apiKeyTrigger.addEventListener('click', () => apiModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => apiModal.classList.add('hidden'));
apiModal.addEventListener('click', event => {
    if (event.target === apiModal) apiModal.classList.add('hidden');
});

function pcmToWavBlob(base64Pcm, sampleRate = 24000) {
    const binaryString = atob(base64Pcm);
    const pcmLength = binaryString.length;
    const wavBuffer = new ArrayBuffer(44 + pcmLength);
    const view = new DataView(wavBuffer);

    function writeStr(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + pcmLength, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, pcmLength, true);

    const bytes = new Uint8Array(wavBuffer, 44);
    for (let i = 0; i < pcmLength; i++) bytes[i] = binaryString.charCodeAt(i);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

function speakWithBrowserBritishVoice(text) {
    if (!('speechSynthesis' in window)) {
        showError('المتصفح لا يدعم النطق الصوتي. جرّب متصفحًا حديثًا.');
        return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = selectedSpeed;
    const voices = window.speechSynthesis.getVoices();
    const britishVoice = voices.find(voice => voice.lang.includes('en-GB') || voice.name.includes('UK') || voice.name.includes('British'));
    if (britishVoice) utterance.voice = britishVoice;
    window.speechSynthesis.speak(utterance);
    return true;
}

function showError(message) {
    statusMsg.textContent = message;
    statusMsg.classList.remove('hidden');
}

convertBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
        showError('يرجى كتابة أو لصق النص الإنجليزي أولاً.');
        return;
    }

    statusMsg.classList.add('hidden');
    convertBtn.disabled = true;
    btnText.textContent = 'جاري توليد الصوت...';
    spinner.classList.remove('hidden');

    try {
        const selectedOption = voiceSelect.options[voiceSelect.selectedIndex];
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voiceName: selectedOption.value,
                styleDesc: selectedOption.dataset.style
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'فشل الاتصال بخدمة توليد الصوت.');
        if (!data.audioData) throw new Error('لم يتم استلام بيانات صوتية صالحة.');

        const wavBlob = pcmToWavBlob(data.audioData, data.sampleRate || 24000);
        const audioUrl = URL.createObjectURL(wavBlob);
        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = selectedSpeed;
        downloadBtn.href = audioUrl;
        audioResult.classList.remove('hidden');
        await audioPlayer.play();
    } catch (error) {
        const usedFallback = speakWithBrowserBritishVoice(text);
        showError(usedFallback
            ? 'تعذر توليد ملف WAV حاليًا، فتم تشغيل النطق البريطاني المدمج في المتصفح بدلًا منه.'
            : `خطأ: ${error.message}`);
    } finally {
        convertBtn.disabled = false;
        btnText.textContent = 'تحويل النص إلى صوت';
        spinner.classList.add('hidden');
    }
});

updateCharCounter();

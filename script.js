// ==========================================
// ضع مفتاح Google AI Studio الخاص بك هنا
// أو اضغط على أيقونة الموجات الصوتية الزرقاء في أعلى الموقع لإدخاله من المتصفح
// ==========================================
const DEFAULT_API_KEY = "";

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

// Modal elements
const apiKeyTrigger = document.getElementById('apiKeyTrigger');
const apiModal = document.getElementById('apiModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
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

// Paste Button
pasteBtn.addEventListener('click', async () => {
    try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
            textInput.value = clipText;
            updateCharCounter();
        }
    } catch (err) {
        textInput.focus();
    }
});

// Sample Button
sampleBtn.addEventListener('click', () => {
    sampleIdx = (sampleIdx + 1) % samples.length;
    textInput.value = samples[sampleIdx];
    updateCharCounter();
});

// Clear Button
clearBtn.addEventListener('click', () => {
    textInput.value = '';
    updateCharCounter();
    audioResult.classList.add('hidden');
    statusMsg.classList.add('hidden');
});

// Speed Selection
speedPills.forEach(pill => {
    pill.addEventListener('click', () => {
        speedPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedSpeed = parseFloat(pill.dataset.speed);
        if (audioPlayer.src) {
            audioPlayer.playbackRate = selectedSpeed;
        }
    });
});

// API Key Modal Logic
apiKeyTrigger.addEventListener('click', () => {
    apiKeyInput.value = localStorage.getItem('gemini_tts_api_key') || DEFAULT_API_KEY;
    apiModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
    apiModal.classList.add('hidden');
});

saveKeyBtn.addEventListener('click', () => {
    const val = apiKeyInput.value.trim();
    if (val) {
        localStorage.setItem('gemini_tts_api_key', val);
    } else {
        localStorage.removeItem('gemini_tts_api_key');
    }
    apiModal.classList.add('hidden');
});

// Convert PCM16 Base64 to WAV Blob
function pcmToWavBlob(base64Pcm, sampleRate = 24000) {
    const binaryString = atob(base64Pcm);
    const pcmLength = binaryString.length;
    const wavBuffer = new ArrayBuffer(44 + pcmLength);
    const view = new DataView(wavBuffer);

    function writeStr(offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + pcmLength, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, pcmLength, true);

    const bytes = new Uint8Array(wavBuffer, 44);
    for (let i = 0; i < pcmLength; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([wavBuffer], { type: 'audio/wav' });
}

// Fallback to Browser UK Speech Synthesis if no API key is configured
function speakWithBrowserBritishVoice(text) {
    if (!('speechSynthesis' in window)) {
        showError('المتصفح لا يدعم النطق الصوتي، يرجى إدخال مفتاح Gemini API عبر الضغط على أيقونة الموجات في الأعلى.');
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = selectedSpeed;

    const voices = window.speechSynthesis.getVoices();
    const britishVoice = voices.find(v => v.lang.includes('en-GB') || v.name.includes('UK') || v.name.includes('British'));
    if (britishVoice) {
        utterance.voice = britishVoice;
    }
    window.speechSynthesis.speak(utterance);
}

function showError(msg) {
    statusMsg.textContent = msg;
    statusMsg.classList.remove('hidden');
}

// Convert Action
convertBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) {
        showError('يرجى كتابة أو لصق النص الإنجليزي أولاً.');
        return;
    }

    statusMsg.classList.add('hidden');
    const activeKey = localStorage.getItem('gemini_tts_api_key') || DEFAULT_API_KEY;

    if (!activeKey) {
        speakWithBrowserBritishVoice(text);
        showError('تم النطق عبر المتصفح (بلهجة بريطانية). لتفعيل تحميل ملف WAV بجودة استوديو، اضغط على أيقونة الموجات الزرقاء في الأعلى لإدخال مفتاح API.');
        return;
    }

    convertBtn.disabled = true;
    btnText.textContent = 'جاري توليد الصوت...';
    spinner.classList.remove('hidden');

    try {
        const selectedOption = voiceSelect.options[voiceSelect.selectedIndex];
        const voiceName = selectedOption.value;
        const styleDesc = selectedOption.dataset.style;

        const promptText = `Speak the following text in a clear, natural, authentic ${styleDesc} (en-GB). Output only the spoken text exactly as written: "${text}"`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${activeKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName }
                        }
                    }
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || 'فشل الاتصال بخدمة توليد الصوت.');
        }

        const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!inlineData || !inlineData.data) {
            throw new Error('لم يتم استلام بيانات صوتية صالحة.');
        }

        const wavBlob = pcmToWavBlob(inlineData.data, 24000);
        const audioUrl = URL.createObjectURL(wavBlob);

        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = selectedSpeed;
        downloadBtn.href = audioUrl;

        audioResult.classList.remove('hidden');
        audioPlayer.play();
    } catch (err) {
        showError(`خطأ: ${err.message}`);
    } finally {
        convertBtn.disabled = false;
        btnText.textContent = 'تحويل النص إلى صوت';
        spinner.classList.add('hidden');
    }
});

const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");

// Menyimpan riwayat obrolan dalam format [{ role: "user" | "assistant", content: "..." }]
let conversationHistory = [];

// Tambahkan bubble pesan ke layar dan kembalikan elemen bubble-nya
function appendMessage(text, sender) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", sender);

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.textContent = text;

  msgDiv.appendChild(bubble);
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  return bubble;
}

// Tampilkan animasi titik tiga sebelum chunk pertama masuk
function showTyping() {
  const typingDiv = document.createElement("div");
  typingDiv.classList.add("message", "bot");
  typingDiv.id = "typing-bubble";

  typingDiv.innerHTML = `
    <div class="bubble typing-indicator">
      <span></span><span></span><span></span>
    </div>
  `;
  chatBox.appendChild(typingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTyping() {
  const typingBubble = document.getElementById("typing-bubble");
  if (typingBubble) typingBubble.remove();
}

// Handle kirim pesan & baca stream SSE
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  // Tampilkan pesan user dan simpan ke riwayat
  appendMessage(text, "user");
  conversationHistory.push({ role: "user", content: text });

  userInput.value = "";
  userInput.disabled = true;
  sendBtn.disabled = true;

  showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    if (!response.ok) {
      removeTyping();
      const errData = await response.json().catch(() => ({}));
      appendMessage(errData.error || "Terjadi kesalahan pada server.", "bot");
      return;
    }

    // Siapkan reader untuk membaca SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let botBubble = null;
    let fullReply = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Simpan potongan baris yang belum lengkap

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") continue;

        try {
          const chunkText = JSON.parse(dataStr);

          // Saat potongan teks pertama tiba, hapus indikator mengetik dan buat bubble bot
          if (!botBubble) {
            removeTyping();
            botBubble = appendMessage("", "bot");
          }

          fullReply += chunkText;
          botBubble.textContent = fullReply;
          chatBox.scrollTop = chatBox.scrollHeight;
        } catch (parseErr) {
          console.error("Gagal parsing stream chunk:", parseErr);
        }
      }
    }

    // Simpan jawaban lengkap bot ke riwayat agar konteks obrolan nyambung
    if (fullReply) {
      conversationHistory.push({ role: "assistant", content: fullReply });
    } else {
      removeTyping();
    }
  } catch (error) {
    removeTyping();
    appendMessage("Gagal terhubung ke server.", "bot");
    console.error(error);
  } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
});

// Reset tampilan dan riwayat percakapan
clearBtn.addEventListener("click", () => {
  conversationHistory = [];
  chatBox.innerHTML = `
    <div class="message bot">
      <div class="bubble">Obrolan telah dibersihkan. Ada yang bisa dibantu lagi?</div>
    </div>
  `;
});
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { ChatHistoryEntry, ChatMessage, ChatSendResult } from "../types";
import "./ChatPanel.css";

const disconnectedMessage = "桌宠服务未连接，请重新启动应用。";
const greetingMessage: ChatMessage = { role: "assistant", content: "我在，想聊什么都可以。" };

function readInitialDraft() {
  return new URLSearchParams(window.location.search).get("draft") ?? "";
}

function toMessages(history: ChatHistoryEntry[]): ChatMessage[] {
  return history.map((message) => ({ role: message.role, content: message.content }));
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([greetingMessage]);
  const [draft, setDraft] = useState(readInitialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    const api = window.petdex;

    if (!api?.chat) {
      return () => {
        active = false;
      };
    }

    void api.chat.listHistory()
      .then((history) => {
        if (!active) {
          return;
        }
        setMessages(history.length > 0 ? toMessages(history) : [greetingMessage]);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "读取聊天记录失败");
        }
      });

    return () => {
      active = false;
    };
  }, []);


  useLayoutEffect(() => {
    const messageList = messagesRef.current;
    if (!messageList) {
      return;
    }

    messageList.scrollTop = messageList.scrollHeight;
  }, [messages]);
  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();
    if (!content || busy) {
      return;
    }

    const api = window.petdex;
    if (!api?.chat) {
      setError(disconnectedMessage);
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);
    setError("");

    try {
      const result = await api.chat.send({ content }) as ChatSendResult;
      setMessages(result.history?.length ? toMessages(result.history) : [...nextMessages, result.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "聊天失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="chat-root">
      <header className="chat-titlebar">
        <h1>和宠物聊天</h1>
        <button
          className="chat-close"
          type="button"
          aria-label="关闭聊天"
          title="关闭"
          onClick={() => {
            void window.petdex?.windowControls.close();
          }}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <section ref={messagesRef} className="chat-messages" aria-label="聊天记录">
        {messages.map((message, index) => (
          <article className={`chat-message is-${message.role}`} key={`${message.role}-${index}-${message.content}`}>
            <p>{message.content}</p>
          </article>
        ))}
      </section>
      {error && <p role="alert" className="chat-error">{error}</p>}
      <form className="chat-composer" onSubmit={sendMessage}>
        <textarea
          aria-label="输入聊天内容"
          value={draft}
          rows={3}
          placeholder="和我说点什么..."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" aria-label="发送" disabled={!draft.trim() || busy}>
          <Send size={17} aria-hidden />
          <span>发送</span>
        </button>
      </form>
    </main>
  );
}


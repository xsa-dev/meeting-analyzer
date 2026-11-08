"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_MEETING_API || "http://localhost:8000";
const stages = {
  fetching: "Получение файла",
  transcribing: "Распознавание речи",
  analyzing: "AI-анализ",
  done: "Готово",
  error: "Ошибка",
  duplicate: "Уже обработано",
};
const active = ["fetching", "transcribing", "analyzing"];

async function request(path, options) {
  const response = await fetch(API + path, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(typeof result.detail === "string" ? result.detail : "Проверьте введённые данные.");
  }
  return result;
}

function readableError(error) {
  return error instanceof TypeError ? "Сервер недоступен. Попробуйте ещё раз." : error.message;
}

export default function Dashboard() {
  const [rows, setRows] = useState([]);
  const [selected, select] = useState(null);
  const [detail, setDetail] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const current = rows.find((row) => row.id === selected);

  useEffect(() => {
    let live = true;
    let timer;
    async function poll() {
      try {
        const data = await request("/meetings");
        if (live) {
          setRows(data);
          setListError("");
        }
      } catch (error) {
        if (live) setListError(readableError(error));
      } finally {
        if (live) timer = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [refresh]);

  useEffect(() => {
    if (current?.status !== "done") return;
    let live = true;
    request("/meetings/" + selected).then((result) => {
      if (live) setDetail(result);
    }).catch((error) => {
      if (live) setDetailError(readableError(error));
    });
    return () => { live = false; };
  }, [selected, current?.status, refresh]);

  function open(id) {
    setDetailError("");
    select(id);
  }

  async function add(path, options) {
    setBusy(true);
    setError("");
    try {
      const data = await request("/meetings/" + path, { method: "POST", ...options });
      open(data.id);
      setRefresh((value) => value + 1);
      return true;
    } catch (error) {
      setError(readableError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCloud(event) {
    event.preventDefault();
    if (await add("cloud", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })) setUrl("");
  }

  async function addFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (file) await add("upload", {
      headers: { "X-Filename": encodeURIComponent(file.name) },
      body: file,
    });
  }

  return <main>
    <header>
      <p className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО / ВСТРЕЧИ</p>
      <h1>Анализ встреч</h1>
      <p className="intro">Добавьте видеозапись, чтобы получить расшифровку и конспект встречи.</p>
    </header>

    <section className="panel import">
      <form onSubmit={addCloud}>
        <label htmlFor="cloud">Ссылка на видеозапись</label>
        <div className="actions">
          <input id="cloud" type="url" placeholder="https://disk.yandex.ru/i/…" value={url}
            onChange={(event) => setUrl(event.target.value)} required disabled={busy} />
          <button disabled={busy}>Добавить из облака</button>
        </div>
        <p className="muted">Публичная ссылка Яндекс Диска · MP4 или WebM · до 150 МиБ</p>
      </form>
      <div className="upload">
        <label className="file-label">Загрузить с компьютера
          <input aria-label="Загрузить с компьютера" type="file" accept=".mp4,.webm" onChange={addFile} disabled={busy} />
        </label>
      </div>
      {busy && <p role="status">Добавляем запись…</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>

    <div className="dashboard">
      <section className="panel">
        <h2>Записи</h2>
        {listError && <p role="alert" className="error">{listError}</p>}
        {!rows.length && !listError && <p className="muted">Здесь появятся добавленные встречи.</p>}
        <div className="records">
          {rows.map((row) => <button type="button" key={row.id}
            className={row.id === selected ? "record selected" : "record"}
            aria-pressed={row.id === selected} onClick={() => open(row.id)}>
            <strong>{row.name}</strong>
            <span className="muted">{row.source === "cloud" ? "Из облака" : "Загружено вручную"} · {
              new Date(row.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
            }</span>
            <span className={"badge " + row.status}>{stages[row.status]}</span>
            {row.summary && <span className="preview">{row.summary.overview}</span>}
          </button>)}
        </div>
      </section>

      <section className="panel result" aria-label="Конспект встречи">
        <h2>{current?.name || "Конспект встречи"}</h2>
        {!current && <p className="muted">Выберите запись, чтобы открыть результат.</p>}
        {current && <p className={"badge " + current.status} role="status">{stages[current.status]}</p>}
        {active.includes(current?.status) && <p className="muted">Результат появится здесь после обработки.</p>}
        {current?.error && <p role="alert" className="error">{current.error}</p>}
        {current?.duplicate_of && <button onClick={() => open(current.duplicate_of)}>Открыть готовый результат</button>}
        {detailError && <p role="alert" className="error">{detailError}</p>}
        {current?.summary && <div className="notes">
          <h3>Краткое содержание</h3>
          <p>{current.summary.overview}</p>
          {[["decisions", "Решения"], ["tasks", "Задачи"], ["questions", "Открытые вопросы"]].map(([key, label]) =>
            <section key={key}><h3>{label}</h3>
              {current.summary[key].length ? <ul>{current.summary[key].map((item, index) =>
                <li key={index}>{item}</li>)}</ul> : <p className="muted">В записи не выявлены.</p>}
            </section>
          )}
          {detail?.id === selected && <details><summary>Расшифровка</summary><p>{detail.transcript}</p></details>}
        </div>}
      </section>
    </div>
  </main>;
}

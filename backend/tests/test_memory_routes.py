def test_memory_import_and_reopen(client) -> None:
    payload = {
        "heading": "Imported central bank note",
        "prompt": "What changed in this imported discussion?",
        "answer": "Policy language turned more cautious and growth-sensitive.",
        "created_at": "2026-03-11T09:30:00+00:00",
        "theme_id": "monetary-policy",
        "theme_label": "Monetary Policy",
        "horizon": "weekly",
        "analysis_mode": "imported",
    }

    imported = client.post("/api/v1/memory/import", json=payload)
    assert imported.status_code == 200
    imported_data = imported.json()
    assert imported_data["imported"] is True
    assert imported_data["heading"] == payload["heading"]

    entry_id = imported_data["entry_id"]

    history = client.get("/api/v1/memory/history")
    assert history.status_code == 200
    history_entries = history.json()["entries"]
    assert any(item["entry_id"] == entry_id for item in history_entries)

    entry = client.get(f"/api/v1/memory/entries/{entry_id}")
    assert entry.status_code == 200
    entry_data = entry.json()
    assert entry_data["heading"] == payload["heading"]
    assert entry_data["prompt"] == payload["prompt"]
    assert entry_data["answer"] == payload["answer"]
    assert entry_data["theme_label"] == payload["theme_label"]

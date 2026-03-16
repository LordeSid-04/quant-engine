import json


def test_health_endpoint(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_stooq_endpoint(client) -> None:
    response = client.get("/api/stooq", params={"symbol": "cl.f"})
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "cl.f"
    assert "close" in data
    assert "provenance" in data
    assert data["provenance"]["provider"]


def test_stooq_batch_endpoint(client) -> None:
    response = client.get("/api/stooq/batch", params={"symbols": "cl.f,eurusd"})
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 2
    assert data["items"][0]["quote"]["provenance"]["mode"]


def test_world_pulse_contract(client) -> None:
    response = client.get("/api/v1/world-pulse/live")
    assert response.status_code == 200
    data = response.json()
    assert "hotspots" in data
    assert "arcs" in data
    assert "confidence" in data
    assert "data_proof" in data
    assert len(data["hotspots"]) >= 50


def test_world_pulse_relation_contract(client) -> None:
    response = client.get("/api/v1/world-pulse/relation", params={"from_country": "us", "to_country": "cn"})
    assert response.status_code == 200
    data = response.json()
    assert "relation_strength" in data
    assert "arc" in data
    assert "data_proof" in data
    assert data["arc"]["from"] == "us"
    assert data["arc"]["to"] == "cn"


def test_world_pulse_country_proof_contract(client) -> None:
    response = client.get("/api/v1/world-pulse/country-proof", params={"country_id": "us"})
    assert response.status_code == 200
    data = response.json()
    assert data["context"]
    assert data["sources"]


def test_scenario_contract(client) -> None:
    payload = {
        "driver": "Interest Rates",
        "event": "Rate Hike +100bp",
        "region": "United States",
        "severity": 70,
        "horizon": "12 Months",
    }
    response = client.post("/api/v1/scenario/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "graph" in data
    assert "impacts" in data
    assert "execution_trace" in data


def test_scenario_stream_contract(client) -> None:
    payload = {
        "driver": "Interest Rates",
        "event": "Rate Hike +100bp",
        "region": "United States",
        "severity": 70,
        "horizon": "12 Months",
    }
    with client.stream("POST", "/api/v1/scenario/run/stream", json=payload) as response:
        assert response.status_code == 200
        events = [json.loads(line) for line in response.iter_lines() if line]

    assert any(event.get("type") == "log" for event in events)
    result_event = next(event for event in events if event.get("type") == "result")
    assert "graph" in result_event["result"]
    assert "execution_trace" in result_event["result"]


def test_historical_contract(client) -> None:
    response = client.get("/api/v1/historical/analogues")
    assert response.status_code == 200
    data = response.json()
    assert "regimes" in data
    assert "connections" in data


def test_risk_contract(client) -> None:
    response = client.get("/api/v1/risk-radar/live")
    assert response.status_code == 200
    data = response.json()
    assert "summary_cards" in data
    assert "categories" in data


def test_market_feed_status_contract(client) -> None:
    response = client.get("/api/v1/market/feed-status")
    assert response.status_code == 200
    data = response.json()
    assert "providers" in data
    assert "cache_size" in data


def test_theme_live_contract(client) -> None:
    response = client.get("/api/v1/themes/live")
    assert response.status_code == 200
    data = response.json()
    assert "themes" in data
    assert data["themes"]
    assert "confidence" in data


def test_theme_timeline_contract(client) -> None:
    live = client.get("/api/v1/themes/live")
    assert live.status_code == 200
    theme_id = live.json()["themes"][0]["theme_id"]

    response = client.get(f"/api/v1/themes/{theme_id}/timeline")
    assert response.status_code == 200
    data = response.json()
    assert data["theme_id"] == theme_id
    assert "points" in data


def test_theme_sources_contract(client) -> None:
    live = client.get("/api/v1/themes/live")
    assert live.status_code == 200
    theme_id = live.json()["themes"][0]["theme_id"]

    response = client.get(f"/api/v1/themes/{theme_id}/sources")
    assert response.status_code == 200
    data = response.json()
    assert data["theme_id"] == theme_id
    assert "articles" in data


def test_daily_briefing_contract(client) -> None:
    response = client.get("/api/v1/briefing/daily")
    assert response.status_code == 200
    data = response.json()
    assert "headline_brief" in data
    assert "feed_status" in data
    assert "developments" in data
    assert "theme_board" in data
    assert "risk_posture" in data
    assert "spillover_map" in data
    assert "institutional_memory_preview" in data
    assert data["developments"]
    first = data["developments"][0]
    assert "scorecard" in first
    assert "proof_bundle" in first
    assert "story_graph" in first


def test_daily_briefing_feed_status_contract(client) -> None:
    response = client.get("/api/v1/briefing/feed-status")
    assert response.status_code == 200
    data = response.json()
    assert "healthy_sources" in data
    assert "total_sources" in data
    assert "sources" in data


def test_daily_briefing_development_detail_contract(client) -> None:
    brief = client.get("/api/v1/briefing/daily")
    assert brief.status_code == 200
    development_id = brief.json()["developments"][0]["development_id"]
    response = client.get(f"/api/v1/briefing/developments/{development_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["development"]["development_id"] == development_id
    assert "proof_bundle" in data["development"]


def test_news_navigator_contract(client) -> None:
    payload = {
        "prompt": "Analyze how a surprise Fed rate hike could affect Canadian banks, the CAD, and portfolio risk over the next month.",
        "horizon": "monthly",
        "persist_memory": True,
        "twin": {
            "profile_id": "canadian_pension",
            "custom_name": "Maple Pension Desk",
            "objective": "Protect liabilities while staying opportunistic on inflation and FX shifts.",
        },
        "filters": {
            "region": "united_states",
            "source_types": ["rss"],
            "query": "Fed rate hike CAD banks",
        },
    }
    response = client.post("/api/v1/briefing/news-navigator", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["portfolio_twin"]["label"]
    assert data["portfolio_twin"]["primary_risk"]
    assert len(data["agent_debate"]["agents"]) >= 4
    assert data["agent_debate"]["consensus"]
    assert "carry_forward_actions" in data["memory_recall"]
    assert data["decision_artifact"]["action_checklist"]
    assert data["memory_entry_id"]

    entry = client.get(f"/api/v1/memory/entries/{data['memory_entry_id']}")
    assert entry.status_code == 200
    entry_data = entry.json()
    assert entry_data["portfolio_twin"]["label"] == data["portfolio_twin"]["label"]
    assert entry_data["agent_debate"]["consensus"] == data["agent_debate"]["consensus"]
    assert entry_data["decision_artifact"]["title"] == data["decision_artifact"]["title"]


def test_theme_memory_contract(client) -> None:
    brief = client.get("/api/v1/briefing/daily")
    assert brief.status_code == 200
    developments = brief.json().get("developments", [])
    assert developments
    theme_id = developments[0]["theme_id"]

    response = client.get(f"/api/v1/memory/themes/{theme_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["theme_id"] == theme_id
    assert "discussion_history" in data
    assert "timeline_points" in data
    assert "source_articles" in data

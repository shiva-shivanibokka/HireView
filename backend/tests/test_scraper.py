import scraper


def test_normalise_workplace():
    assert scraper._normalise_workplace("Fully Remote") == "remote"
    assert scraper._normalise_workplace("Hybrid - NYC") == "hybrid"
    assert scraper._normalise_workplace("In office") == "onsite"
    assert scraper._normalise_workplace("") == ""


def test_normalise_job_type():
    assert scraper._normalise_job_type("Summer Internship") == "internship"
    assert scraper._normalise_job_type("Part Time") == "part-time"
    assert scraper._normalise_job_type("Contract / Freelance") == "contract"
    assert scraper._normalise_job_type("Full-time Permanent") == "full-time"
    assert scraper._normalise_job_type("") == ""


def test_greenhouse_parser_filters_by_keyword():
    data = {
        "jobs": [
            {"title": "ML Engineer", "absolute_url": "https://x/1", "location": {"name": "Remote"}},
            {"title": "Chef", "absolute_url": "https://x/2", "location": {"name": "NYC"}},
        ]
    }
    hits = scraper._parse_greenhouse_json(data, "acme", ["ml"])
    titles = [j["title"] for j in hits]
    assert "ML Engineer" in titles
    assert "Chef" not in titles


def test_greenhouse_parser_no_keyword_returns_all():
    data = {"jobs": [
        {"title": "ML Engineer", "absolute_url": "https://x/1", "location": {"name": "Remote"}},
        {"title": "Chef", "absolute_url": "https://x/2", "location": {"name": "NYC"}},
    ]}
    assert len(scraper._parse_greenhouse_json(data, "acme", [])) == 2


def test_is_job_live_none_on_empty_url():
    # empty URL must return None (unknown), never False — otherwise auto-close
    # would wrongly close jobs we simply can't check.
    assert scraper.is_job_live("") is None


def test_make_job_stable_id_from_url():
    a = scraper._make_job("T", "C", "Remote", "https://x/1")
    b = scraper._make_job("T2", "C2", "NYC", "https://x/1")
    assert a["id"] == b["id"]  # id is derived from URL, so re-scrapes dedupe

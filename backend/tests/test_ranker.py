from ranker import score_by_resume


def _jobs():
    return [
        {"title": "Machine Learning Engineer", "description": "pytorch nlp llm python"},
        {"title": "Warehouse Associate", "description": "forklift shipping pallets"},
        {"title": "Sales Representative", "description": "quota crm outbound calls"},
        {"title": "Registered Nurse", "description": "patient care clinical hospital"},
    ]


def test_matching_job_ranks_top():
    jobs = _jobs()
    score_by_resume(jobs, "python machine learning nlp pytorch engineer")
    assert jobs[0]["resume_score"] == 1.0
    assert all(j["resume_score"] < 1.0 for j in jobs[1:])


def test_empty_resume_scores_zero_without_crashing():
    jobs = _jobs()
    score_by_resume(jobs, "")
    assert all(j["resume_score"] == 0.0 for j in jobs)


def test_empty_job_list_is_safe():
    score_by_resume([], "python")  # must not raise

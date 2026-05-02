# ResumeForge — embedded as a local package
# Copied from ResumeForge/backend — do not edit here, sync from source if updated.
from .jd_parser import fetch_jd_text, extract_jd_structured
from .resume_parser import parse_resume
from .resume_builder import build_resume, FontConfig
from .cover_letter import generate_cover_letter_text, build_cover_letter_docx
from .scorer import score_resume, extract_resume_text, quick_gap_analysis
from .project_matcher import match_and_tailor, rank_projects_for_jd
from .github_parser import parse_github_profile

__all__ = [
    "fetch_jd_text",
    "extract_jd_structured",
    "parse_resume",
    "build_resume",
    "FontConfig",
    "generate_cover_letter_text",
    "build_cover_letter_docx",
    "score_resume",
    "extract_resume_text",
    "quick_gap_analysis",
    "match_and_tailor",
    "rank_projects_for_jd",
    "parse_github_profile",
]

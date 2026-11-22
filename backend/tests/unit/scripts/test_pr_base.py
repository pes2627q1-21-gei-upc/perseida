"""Tests de `scripts/pr_base.py` (base real d'una PR, també si és apilada).

En una PR d'un stack de GitHub, `github.base_ref` val el tronc (`develop`) i no la
branca pare; la base real només la dona l'API REST de la PR. El pas del workflow la fa
servir per a `diff-cover` i `mutmut`; si l'API falla, es queda amb la base d'abans.
"""

from __future__ import annotations

import io
import json
import subprocess
import urllib.error
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from scripts import pr_base


class _FakeResponse(io.BytesIO):
    """Resposta HTTP mínima que `urlopen` retorna com a gestor de context."""

    def __init__(self, body: bytes, status: int = 200) -> None:
        super().__init__(body)
        self.status = status


def _opener(body: object, *, status: int = 200) -> Callable[..., _FakeResponse]:
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()

    def fake(_request: object, timeout: float) -> _FakeResponse:
        assert timeout > 0
        return _FakeResponse(raw, status)

    return fake


def _failing_opener(error: Exception) -> Callable[..., _FakeResponse]:
    def fake(_request: object, timeout: float) -> _FakeResponse:
        assert timeout > 0
        raise error

    return fake


def _fetch(**overrides: Any) -> str | None:
    kwargs: dict[str, Any] = {
        "repository": "org/repo",
        "pr_number": 130,
        "token": "tok",
        "urlopen": _opener({"base": {"ref": "feature/TG-64-peces-sala"}}),
    }
    kwargs.update(overrides)
    return pr_base.fetch_pr_base_ref(**kwargs)


# --- fetch_pr_base_ref --------------------------------------------------------


def test_retorna_la_base_real_de_la_pr_segons_l_api() -> None:
    assert _fetch() == "feature/TG-64-peces-sala"


def test_demana_la_pr_a_l_api_amb_el_token_i_el_format_json_de_github() -> None:
    seen: dict[str, Any] = {}

    def fake(request: Any, timeout: float) -> _FakeResponse:
        seen["url"] = request.full_url
        seen["headers"] = {k.lower(): v for k, v in request.header_items()}
        seen["timeout"] = timeout
        return _FakeResponse(json.dumps({"base": {"ref": "develop"}}).encode())

    _fetch(urlopen=fake, api_url="https://api.example.test")

    assert seen["url"] == "https://api.example.test/repos/org/repo/pulls/130"
    assert seen["headers"]["authorization"] == "Bearer tok"
    assert seen["headers"]["accept"] == "application/vnd.github+json"
    assert seen["timeout"] > 0


def test_sense_token_no_envia_capcalera_d_autoritzacio() -> None:
    seen: dict[str, Any] = {}

    def fake(request: Any, timeout: float) -> _FakeResponse:
        seen["headers"] = {k.lower() for k, _ in request.header_items()}
        return _FakeResponse(json.dumps({"base": {"ref": "develop"}}).encode())

    _fetch(urlopen=fake, token=None)

    assert "authorization" not in seen["headers"]


@pytest.mark.parametrize(
    ("repository", "pr_number"),
    [(None, 130), ("", 130), ("org/repo", None), ("org/repo", 0)],
)
def test_sense_repositori_o_numero_de_pr_no_consulta_l_api(
    repository: str | None, pr_number: int | None
) -> None:
    def never(_request: object, timeout: float) -> _FakeResponse:
        raise AssertionError("no s'ha de consultar l'API")

    assert _fetch(repository=repository, pr_number=pr_number, urlopen=never) is None


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError("https://x", 403, "Forbidden", {}, None),  # type: ignore[arg-type]
        urllib.error.URLError("sense xarxa"),
        TimeoutError("massa lent"),
        OSError("connexió reiniciada"),
    ],
)
def test_si_l_api_falla_retorna_none_perque_es_mantingui_la_base_d_abans(
    error: Exception,
) -> None:
    assert _fetch(urlopen=_failing_opener(error)) is None


@pytest.mark.parametrize(
    "body",
    [
        b"no es json",
        b"[]",
        b"{}",
        json.dumps({"base": None}).encode(),
        json.dumps({"base": {"ref": 7}}).encode(),
        json.dumps({"base": {"ref": ""}}).encode(),
    ],
)
def test_una_resposta_estranya_retorna_none(body: bytes) -> None:
    assert _fetch(urlopen=_opener(body)) is None


def test_un_estat_http_que_no_es_200_retorna_none() -> None:
    body = {"base": {"ref": "develop"}}

    assert _fetch(urlopen=_opener(body, status=304)) is None


# --- resolve_base_branch ------------------------------------------------------


def test_usa_la_base_real_si_la_branca_existeix_en_local() -> None:
    resolved = pr_base.resolve_base_branch(
        fallback="origin/develop",
        pr_base_ref="feature/TG-64-peces-sala",
        ref_exists=lambda ref: ref == "origin/feature/TG-64-peces-sala",
    )

    assert resolved == pr_base.ResolvedBase("origin/feature/TG-64-peces-sala", "api")


def test_si_la_base_real_no_existeix_en_local_usa_la_base_d_abans() -> None:
    resolved = pr_base.resolve_base_branch(
        fallback="origin/develop",
        pr_base_ref="feature/esborrada",
        ref_exists=lambda _ref: False,
    )

    assert resolved == pr_base.ResolvedBase("origin/develop", "fallback")


@pytest.mark.parametrize(
    "pr_base_ref",
    [None, "", "--upload-pack=x", "-x", "amb espai", "amb\ttab", "amb\nsalt"],
)
def test_una_base_buida_o_amb_nom_inacceptable_no_es_fa_servir(
    pr_base_ref: str | None,
) -> None:
    resolved = pr_base.resolve_base_branch(
        fallback="origin/develop",
        pr_base_ref=pr_base_ref,
        ref_exists=lambda _ref: True,
    )

    assert resolved == pr_base.ResolvedBase("origin/develop", "fallback")


# --- main ----------------------------------------------------------------------


def _main(
    monkeypatch: pytest.MonkeyPatch,
    argv: list[str],
    *,
    api_ref: str | None,
    existing: set[str],
) -> int:
    monkeypatch.setattr(pr_base, "fetch_pr_base_ref", lambda **_kw: api_ref)
    monkeypatch.setattr(pr_base, "ref_exists_locally", lambda ref: ref in existing)
    return pr_base.main(argv, {"GITHUB_REPOSITORY": "org/repo", "GITHUB_TOKEN": "tok"})


def test_main_imprimeix_nomes_la_base_real_a_stdout_i_explica_la_decisio_a_stderr(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code = _main(
        monkeypatch,
        ["--fallback", "origin/develop", "--pr-number", "130"],
        api_ref="feature/TG-64-peces-sala",
        existing={"origin/feature/TG-64-peces-sala"},
    )

    out, err = capsys.readouterr()
    assert code == 0
    assert out == "origin/feature/TG-64-peces-sala\n"
    assert "base real de la PR #130 segons l'API" in err
    assert "origin/develop" in err


def test_main_amb_l_api_caiguda_imprimeix_la_base_d_abans_i_ho_diu(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    code = _main(
        monkeypatch,
        ["--fallback", "origin/develop", "--pr-number", "130"],
        api_ref=None,
        existing=set(),
    )

    out, err = capsys.readouterr()
    assert code == 0
    assert out == "origin/develop\n"
    assert "no s'ha pogut obtenir la base real de la PR #130" in err


def test_main_sense_pr_number_no_consulta_l_api_i_usa_la_base_d_abans(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def never(**_kw: object) -> str | None:
        raise AssertionError("no s'ha de consultar l'API")

    monkeypatch.setattr(pr_base, "fetch_pr_base_ref", never)

    code = pr_base.main(["--fallback", "origin/main"], {})

    assert code == 0
    assert capsys.readouterr().out == "origin/main\n"


@pytest.mark.parametrize("value", ["abc", "0", "-3", "1.5", ""])
def test_main_amb_un_pr_number_invalid_el_tracta_com_si_no_n_hi_hagues(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    value: str,
) -> None:
    code = _main(
        monkeypatch,
        ["--fallback", "origin/develop", "--pr-number", value],
        api_ref="feature/x",
        existing={"origin/feature/x"},
    )

    assert code == 0
    assert capsys.readouterr().out == "origin/develop\n"


# --- ref_exists_locally --------------------------------------------------------


def test_una_ref_existeix_en_local_si_git_la_resol_a_un_commit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def git(*args: str) -> None:
        subprocess.run(
            ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
            cwd=tmp_path,
            check=True,
            capture_output=True,
        )

    git("init", "-q")
    git("commit", "-q", "--allow-empty", "-m", "inici")
    git("update-ref", "refs/remotes/origin/feature/x", "HEAD")
    monkeypatch.chdir(tmp_path)

    assert pr_base.ref_exists_locally("origin/feature/x") is True
    assert pr_base.ref_exists_locally("origin/no-hi-es") is False

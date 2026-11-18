"""Tests de `scripts/run_mutmut_diff.py` (selecció de fitxers de domini a mutar)."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts import run_mutmut_diff


def _fake_git_diff(monkeypatch: pytest.MonkeyPatch, changed: list[str]) -> None:
    def fake_run(cmd: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout="\n".join(changed), stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(Path, "is_file", lambda _self: True)


def test_ignora_els_ports_perque_son_protocols_sense_logica(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _fake_git_diff(monkeypatch, ["backend/app/domain/chat/ports.py"])

    assert run_mutmut_diff.get_changed_domain_files("origin/develop") == []


def test_conserva_els_fitxers_de_domini_amb_logica(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _fake_git_diff(
        monkeypatch,
        [
            "backend/app/domain/chat/ports.py",
            "backend/app/domain/chat/entities.py",
            "backend/app/domain/events/services.py",
        ],
    )

    assert run_mutmut_diff.get_changed_domain_files("origin/develop") == [
        "app/domain/chat/entities.py",
        "app/domain/events/services.py",
    ]


def test_un_fitxer_que_nomes_acaba_en_ports_no_s_ignora(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _fake_git_diff(monkeypatch, ["backend/app/domain/chat/transports.py"])

    assert run_mutmut_diff.get_changed_domain_files("origin/develop") == [
        "app/domain/chat/transports.py"
    ]

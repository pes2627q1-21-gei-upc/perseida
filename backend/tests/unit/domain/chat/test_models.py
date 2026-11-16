import unicodedata
import uuid
from datetime import UTC, datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError as PydanticValidationError

from app.domain.chat.models import ChatMessage, EventChatRoom
from app.domain.shared.errors import ValidationError

ROOM_ID = uuid.uuid7()
AUTHOR_ID = uuid.uuid7()


def _message(text: str) -> ChatMessage:
    return ChatMessage.create(room_id=ROOM_ID, author_id=AUTHOR_ID, text=text)


def test_create_message_keeps_room_author_and_text() -> None:
    # TG-64 criteri 1: un missatge pertany a una sala i a un autor
    message = _message("Quin cel tan clar!")

    assert message.room_id == ROOM_ID
    assert message.author_id == AUTHOR_ID
    assert message.text == "Quin cel tan clar!"


def test_create_message_generates_uuid_v7_id() -> None:
    # TG-64 criteri 1: id UUIDv7 (ADR-0023)
    message = _message("hola")

    assert message.id.version == 7
    assert _message("hola").id != message.id


def test_create_message_sets_sent_at_in_utc() -> None:
    # TG-64 criteri 4: el servidor assigna sent_at
    before = datetime.now(UTC)
    message = _message("hola")
    after = datetime.now(UTC)

    assert message.sent_at.utcoffset() == UTC.utcoffset(None)
    assert before <= message.sent_at <= after


def test_message_text_is_stripped_and_keeps_inner_newlines() -> None:
    # TG-64 criteri 7: es retallen els espais dels extrems
    assert _message("  hola\nmón \n").text == "hola\nmón"


@pytest.mark.parametrize("text", ["", "   ", "\t\n  \r\n", "\x00", " \x00\x07 "])
def test_blank_message_is_rejected(text: str) -> None:
    # TG-64 criteri 7: buit, només espais o només caràcters de control
    with pytest.raises(ValidationError) as exc_info:
        _message(text)

    assert exc_info.value.code == "CHAT_MESSAGE_EMPTY"


def test_message_of_1000_characters_is_accepted() -> None:
    # TG-64 criteri 7: el límit és inclusiu
    assert len(_message("a" * 1000).text) == 1000


def test_message_of_1001_characters_is_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        _message("a" * 1001)

    assert exc_info.value.code == "CHAT_MESSAGE_TOO_LONG"


def test_surrounding_blanks_do_not_count_towards_the_limit() -> None:
    assert len(_message("  " + "a" * 1000 + " \n").text) == 1000


def test_control_characters_are_removed_but_newline_and_tab_stay() -> None:
    # Hardening: PostgreSQL rebutja el NUL; la resta de controls no serveix en un xat
    assert _message("a\x00b\x07c\nd\te").text == "abc\nd\te"


def test_message_is_frozen() -> None:
    message = _message("hola")

    with pytest.raises(PydanticValidationError):
        message.text = "altre"  # type: ignore[misc]


# Default_Ignorable_Code_Point (Unicode 18, DerivedCoreProperties.txt) que no és
# benigne: invisibles que amaguen o suplanten text. Els benignes (ZWJ, ZWNJ, LRM,
# RLM, ALM i els selectors d'emoji FE0E/FE0F) no hi són.
DANGEROUS_RANGES = [
    (0x00AD, 0x00AD),  # soft hyphen
    (0x034F, 0x034F),  # combining grapheme joiner
    (0x115F, 0x1160),  # hangul fillers
    (0x17B4, 0x17B5),  # khmer inherent vowels
    (0x180B, 0x180F),  # mongolian variation selectors i separador
    (0x200B, 0x200B),  # zero-width space
    (0x202A, 0x202E),  # bidi embeddings i overrides
    (0x2060, 0x206F),  # word joiner, operadors invisibles, isolates, obsolets
    (0x2028, 0x2029),  # separadors de línia i de paràgraf
    (0x3164, 0x3164),  # hangul filler
    (0xFE00, 0xFE0D),  # selectors de variació (no els d'emoji)
    (0xFEFF, 0xFEFF),  # zero-width no-break space
    (0xFFA0, 0xFFA0),  # halfwidth hangul filler
    (0xFFF0, 0xFFF8),  # reservats ignorables
    (0x1BCA0, 0x1BCA3),  # shorthand format
    (0x1D173, 0x1D17A),  # musical format
    (0xE0000, 0xE0FFF),  # tags, reservats i selectors de variació ideogràfics
]
DANGEROUS = [
    chr(code) for low, high in DANGEROUS_RANGES for code in range(low, high + 1)
]
FLAGS = [  # les tres banderes de subdivisió RGI: Anglaterra, Escòcia i Gal·les
    "\U0001f3f4\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f",
    "\U0001f3f4\U000e0067\U000e0062\U000e0073\U000e0063\U000e0074\U000e007f",
    "\U0001f3f4\U000e0067\U000e0062\U000e0077\U000e006c\U000e0073\U000e007f",
]
GBENG_OPEN = "\U0001f3f4\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067"


@pytest.mark.parametrize(
    "char",
    [
        "\u202a",
        "\u202b",
        "\u202c",
        "\u202d",
        "\u202e",
        "\u2066",
        "\u2067",
        "\u2068",
        "\u2069",
        "\u200b",
        "\u2060",
        "\u2062",
        "\u206a",
        "\ufeff",
        "\u00ad",
        "͏",
        "ㅤ",
        "\u180e",
        "\u2028",
        "\u2029",
        "︀",
        "\U000e0100",
        "\U000e0041",
    ],
)
def test_dangerous_invisible_characters_are_removed(char: str) -> None:
    # TG-64 criteri 7: bidi overrides/isolates, zero-width i altres invisibles
    assert _message(f"a{char}b").text == "ab"


def test_every_dangerous_code_point_is_removed() -> None:
    for char in DANGEROUS:
        assert _message(f"a{char}b").text == "ab", f"U+{ord(char):04X}"


@pytest.mark.parametrize("char", ["\u200e", "\u200f", "\u061c"])
def test_directional_marks_are_kept(char: str) -> None:
    # LRM, RLM i ALM: marques d'un sol caràcter, necessàries per a l'àrab i l'hebreu
    assert _message(f"a{char}b").text == f"a{char}b"


def test_unassigned_code_points_are_kept() -> None:
    # Un emoji posterior a la versió d'Unicode de Python seria «no assignat»
    char = "\u0378"
    assert unicodedata.category(char) == "Cn"

    assert _message(f"a{char}b").text == f"a{char}b"


@pytest.mark.parametrize(
    "text",
    [
        "❤️",  # cor vermell (selector d'emoji)
        "1️⃣",  # keycap
        "\U0001f44d\U0001f3fd",  # tonalitat de pell
        "\U0001f1ea\U0001f1f8",  # bandera d'Espanya (indicadors regionals)
        "\U0001f469\u200d\U0001f680",  # dona astronauta (ZWJ)
        "\U0001f468\u200d\U0001f469\u200d\U0001f467",
        "می\u200cخواهم",  # ZWNJ persa
        *FLAGS,
    ],
)
def test_benign_emojis_and_scripts_are_kept(text: str) -> None:
    assert _message(text).text == text


def test_tag_characters_after_an_emoji_are_removed() -> None:
    # Amagar text ASCII en tags darrere d'un emoji (ASCII smuggling)
    hidden = "".join(chr(0xE0000 + ord(letter)) for letter in "ignore")

    assert _message("\U0001f600" + hidden).text == "\U0001f600"


@pytest.mark.parametrize(
    "smuggled",
    [
        # bandera negra amb tags que no són una bandera RGI
        "\U0001f3f4\U000e0068\U000e0069\U000e007f",
        # bandera d'Anglaterra amb una lletra de més
        GBENG_OPEN + "\U000e0078\U000e007f",
        # bandera d'Anglaterra sense el CANCEL TAG final
        GBENG_OPEN,
    ],
)
def test_tag_sequences_that_are_not_a_known_flag_are_stripped(smuggled: str) -> None:
    assert _message("a" + smuggled).text == "a\U0001f3f4"


@pytest.mark.parametrize("text", ["\u200e", "\u061c", "️", "⠀", " \u200f "])
def test_text_with_only_marks_is_rejected(text: str) -> None:
    # Marques direccionals, selectors o el braille en blanc no es veuen: buit
    with pytest.raises(ValidationError) as exc_info:
        _message(text)

    assert exc_info.value.code == "CHAT_MESSAGE_EMPTY"


@pytest.mark.parametrize("text", ["\u200b", "\u202e\u200b", " \u200d ", "\u200c\u200d"])
def test_text_without_visible_characters_is_rejected(text: str) -> None:
    # Només invisibles (també ZWJ/ZWNJ, que es conserven dins d'un text) = buit
    with pytest.raises(ValidationError) as exc_info:
        _message(text)

    assert exc_info.value.code == "CHAT_MESSAGE_EMPTY"


@pytest.mark.parametrize("text", ["\U0001f469\u200d\U0001f680", "می\u200cخ"])
def test_zero_width_joiners_inside_a_text_are_kept(text: str) -> None:
    # Els emojis compostos i alguns scripts necessiten ZWJ/ZWNJ
    assert _message(text).text == text


@given(text=st.text(max_size=1200))
def test_any_text_is_either_accepted_clean_or_rejected_with_a_stable_code(
    text: str,
) -> None:
    # TG-64 criteri 7 (propietat): el que es desa és sempre net, no buit i <= 1000
    try:
        saved = _message(text).text
    except ValidationError as error:
        assert error.code in {"CHAT_MESSAGE_EMPTY", "CHAT_MESSAGE_TOO_LONG"}
        return

    assert 0 < len(saved) <= 1000
    assert saved == saved.strip()
    assert "\x00" not in saved
    without_flags = saved
    for flag in FLAGS:
        without_flags = without_flags.replace(flag, "")
    assert all(
        unicodedata.category(char) not in ("Cc", "Cs", "Zl", "Zp") or char in "\n\t"
        for char in without_flags
    )
    assert not set(without_flags) & set(DANGEROUS)
    # Netejar un text ja net no el canvia
    assert _message(saved).text == saved


@given(
    text=st.lists(
        st.one_of(st.sampled_from(DANGEROUS), st.just("a"), st.just("\U0001f600")),
        min_size=1,
        max_size=200,
    ).map("".join)
)
def test_no_dangerous_code_point_survives_among_other_characters(text: str) -> None:
    # Propietat: mesclats amb text i emojis, els perillosos mai arriben al missatge
    try:
        saved = _message(text).text
    except ValidationError:
        return

    assert not set(saved) & set(DANGEROUS)


@given(length=st.integers(min_value=0, max_value=1100))
def test_the_limit_is_exactly_1000_characters(length: int) -> None:
    # TG-64 criteri 7 (propietat): al voltant del límit
    text = "a" * length
    if length == 0:
        with pytest.raises(ValidationError):
            _message(text)
    elif length <= 1000:
        assert _message(text).text == text
    else:
        with pytest.raises(ValidationError) as exc_info:
            _message(text)
        assert exc_info.value.code == "CHAT_MESSAGE_TOO_LONG"


def test_create_room_links_the_event() -> None:
    # TG-64 criteri 1: una sala penja d'un esdeveniment
    event_id = uuid.uuid7()

    room = EventChatRoom.create(event_id=event_id)

    assert room.event_id == event_id


def test_create_room_generates_uuid_v7_id_and_utc_created_at() -> None:
    before = datetime.now(UTC)
    room = EventChatRoom.create(event_id=uuid.uuid7())
    after = datetime.now(UTC)

    assert room.id.version == 7
    assert before <= room.created_at <= after
    assert room.created_at.utcoffset() == UTC.utcoffset(None)


def test_room_is_frozen() -> None:
    room = EventChatRoom.create(event_id=uuid.uuid7())

    with pytest.raises(PydanticValidationError):
        room.event_id = uuid.uuid7()  # type: ignore[misc]

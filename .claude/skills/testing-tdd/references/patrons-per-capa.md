# Patrons de test per capa (orientatius)

Els exemples són il·lustratius: noms, tipus i rutes són una proposta; verifica'ls amb el codi real i amb l'humà.

## Domini: invariant (backend)

```python
# tests/unit/domain/event/test_subscription.py
import pytest

from app.domain.event.entities import EventSubscription
from app.domain.shared.errors import DomainError


def test_tg_nn_subscription_requires_event():
    """TG-NN criteri 2: no es pot subscriure sense esdeveniment."""
    with pytest.raises(DomainError) as exc:
        EventSubscription.create(user_id=some_user_id, event_id=None)
    assert exc.value.code == "SUBSCRIPTION_EVENT_REQUIRED"
```

Primer s'executa i es veu fallar (`ImportError` o `AssertionError`); es fa commit `test:`; després s'escriu `create()`.

## Service amb fake del port

```python
# tests/fakes/subscription_repository.py
class InMemorySubscriptionRepository:
    def __init__(self) -> None:
        self.items: dict[UUID, EventSubscription] = {}

    async def add(self, s: EventSubscription) -> None:
        self.items[s.id] = s
```

El fake implementa el `Protocol` del port. Si hi ha repositori real, un test de contracte compartit corre contra el fake i contra l'adaptador (vegeu `testing-integracio`).

## Router

`httpx.AsyncClient(transport=ASGITransport(app=app))` amb `app.dependency_overrides[get_x] = ...`. Comprova status, `Content-Type: application/problem+json`, `code` i `correlation_id` (skill `gestio-errors`).

## Hook amb client simulat (frontend)

```ts
jest.mock('@/shared/api/client'); // el client openapi-fetch es simula al límit del hook
// renderHook amb QueryClientProvider de prova; assert: loading -> èxit i loading -> error (AppError amb code)
```

## Component per rol

```tsx
render(<GlossyButton label="Desa" disabled onPress={onPress} />);
fireEvent.press(screen.getByRole('button', { name: 'Desa' }));
expect(onPress).not.toHaveBeenCalled();
```

Les queries per rol/etiqueta són també la comprovació d'accessibilitat (WCAG 2.2 AA). El lint d'a11y (`eslint-plugin-jsx-a11y`) és una dependència nova: pregunta abans d'afegir-lo.

## Antipatrons

- Test que importa el codi sota prova i en copia la lògica per calcular l'esperat.
- `assert True`, `expect(x).toBeDefined()` com a únic assert.
- Snapshot gran d'un component per «cobrir» línies.
- Tests que depenen de l'ordre d'execució: amb `pytest-randomly` (previst) fallarien.

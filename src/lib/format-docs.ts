import { z } from 'zod';
import {
  SCHEMA_BY_FORMAT,
  CONTENT_KEYS_BY_FORMAT,
  servingBlockSchema,
  promoFormats,
  type PromoFormat,
} from './schema';
import { FORMAT_LABEL } from './format-labels';

/**
 * Генератор человекочитаемой документации по per-format zod-схемам
 * (`docs/promo-format-schemas.md`). Общая логика для `scripts/generate-format-docs.ts`
 * (запись файла) и `src/lib/format-docs.test.ts` (drift-тест: сравнивает
 * свежую генерацию с закоммиченным файлом).
 *
 * В schema.ts нет `.describe()`-аннотаций (осознанно — это не наш файл),
 * поэтому русские описания полей живут здесь, в FIELD_DESCRIPTIONS.
 */

/** Русские описания полей по "пути" (dot-path от корня схемы формата).
 *  Путь для вложенных объектов — `parent.child` (например `action.href`),
 *  для элементов массива объектов — `field[].child` (например `steps[].title`).
 *  Если пути нет в словаре — попадает под общий fallback по имени листового
 *  поля (см. FIELD_DESCRIPTIONS_BY_LEAF ниже). */
const FIELD_DESCRIPTIONS: Record<string, string> = {
  id: 'Уникальный идентификатор промо',
  name: 'Название промо для админки (не показывается юзеру)',
  title: 'Заголовок промо — обязателен для всех форматов, часть контракта BFF',
  startsAt: 'Дата и время начала показа',
  endsAt: 'Дата и время окончания показа',
  targeting: 'Таргетинг аудитории показа',
  'targeting.minAge': 'Минимальный возраст юзера',
  'targeting.maxAge': 'Максимальный возраст юзера',
  'targeting.regions': 'Список регионов показа (пусто = без ограничения)',
  'targeting.subscriptionLevels': 'Уровни подписки юзера, которым показывается промо',
  'targeting.search': 'Таргетинг по истории запросов из search_queries (пустые фразы и разделы = фильтр выключен)',
  'targeting.search.terms': 'Поисковые фразы для сопоставления (до 20 фраз, 2–80 символов каждая; после нормализации остаётся минимум 2 буквы или цифры)',
  'targeting.search.sections': 'Разделы, в которых юзер выполнял поиск (до 20 значений)',
  'targeting.search.match': 'Режим совпадения поисковых фраз: хотя бы одна (any) или все (all)',
  'targeting.search.lookbackDays': 'Глубина истории поиска: от 1 до 30 дней (по умолчанию 30)',
  'targeting.behavior': 'Поведение зрителя: интересы по просмотрам объявлений / горячий покупатель / вовлечённость визита (условия объединяются по И; пустой блок = гейта нет)',
  'targeting.behavior.interest': 'Интересы: зритель РЕАЛЬНО открывал объявления заданных категорий за период (в отличие от targeting.search — что он набирал в поиске)',
  'targeting.behavior.interest.categories': 'Слаги категорий каталога (1–20, до 64 символов; внутри списка — ИЛИ)',
  'targeting.behavior.interest.lookbackDays': 'Окно интересов в днях (1–14 — потолок окна RPC; пусто = дефолт BFF 7)',
  'targeting.behavior.hotBuyer': 'Горячий покупатель: открывал телефоны продавцов за последние 7 дней (окно фиксировано в RPC); анонимов с историей тоже находит',
  'targeting.behavior.hotBuyer.minPhoneViews': 'Минимум открытых телефонов РАЗНЫХ объявлений за 7 дней (1–50; пусто = дефолт BFF 2)',
  'targeting.behavior.minSessionViews': 'Показывать только после N открытых карточек за текущий визит (1–100; перерыв больше 30 минут = новый визит; работает и для гостей)',
  'targeting.geoSegments': 'IP-гео: сегменты показа — local (Абхазия) / tourist (Россия) / other (пусто = без гео-ограничения); если гео не определилось (VPN), промо с правилом не показывается',
  'targeting.geoCities': 'IP-гео: города-слаги, где юзер находится СЕЙЧАС (пусто = любой город; в отличие от targeting.regions — города из профиля)',
  'targeting.visitorClass': 'Профиль визита: newcomer (молодой аккаунт/браузер) или regular (заходит часто); нет поля = любой посетитель; без сигнала промо не показывается',
  'targeting.newcomerMaxAgeDays': 'Порог «новичка»: аккаунт/браузер моложе N дней (1–365; пусто = дефолт BFF 7); имеет смысл только при visitorClass=newcomer',
  'targeting.regularMinVisitDays': 'Порог «постоянного»: не менее M разных дней с визитами за месяц (1–30; пусто = дефолт BFF 5); имеет смысл только при visitorClass=regular',
  schedule: 'Расписание показов (dayparting) поверх окна дат: дни недели + часы МСК; отсутствие поля = 24/7',
  'schedule.daysOfWeek': 'Дни недели показа, ISO-нумерация (1=Пн … 7=Вс); непустой список без дублей',
  'schedule.hourStart': 'Час начала показов (0–23, включительно, МСК)',
  'schedule.hourEnd': 'Час окончания показов (1–24, ИСКЛЮЧАЮЩАЯ граница; 24 = до полуночи, МСК)',
  entrySources: 'Классы источника захода текущей сессии — direct / search / telegram / other (по referrer/utm, кука 30 минут; пусто = любой источник)',
  maxImpressionsPerUser: 'Лимит показов на юзера (пусто = без лимита)',
  cooldownHours: 'Пауза между повторными показами одному юзеру, часов',
  afterPromoId: 'Показывать только после того, как юзер видел указанное промо (id предшественника в цепочке)',
  afterClickPromoId: 'Показывать только кликнувшим по CTA указанного промо (id предшественника; вместе с afterPromoId условия работают как И)',
  suppressAfterClick: 'Не показывать промо кликнувшим по его CTA (кто уже нажал кнопку — больше его не увидит; false не хранится)',
  leadCapture: 'Кнопка отправляет рекламодателю телефон пользователя вместо перехода по ссылке. Работает только для залогиненных; отправившему заявку промо больше не показывается (false не хранится)',
  leadPhone: 'Номер рекламодателя, на который заявка уходит в Telegram сразу после нажатия (обязателен при сборе лидов). Наружу, в креатив, не отдаётся',
  audience: 'Аудитория: все / только авторизованные / только анонимные',
  sections: 'Список разделов сайта, где показывается промо',
  categories: 'Список категорий, где показывается промо',
  sellerStatus: 'Показывать только продавцам или только покупателям',
  lifecycle: 'Таргетинг по стадии жизненного цикла собственных объявлений зрителя (только залогиненные — анонимам не показывается; все условия по И)',
  'lifecycle.activeInCategories': 'Есть активное объявление хотя бы в одной из категорий (слаги, минимум одна)',
  'lifecycle.soldWithinDays': 'Перевёл объявление в «продано» за последние N дней (1–90; работает с продаж после выката sold_at)',
  'lifecycle.hasStalledActive': 'Есть зависшее активное объявление — 30+ дней и меньше 50 просмотров (пороги — константы BFF)',
  'lifecycle.firstListingWithinDays': 'Разместил первое и единственное объявление не позже N дней назад (1–30)',
  deviceTarget: 'Устройства показа: десктоп / тач / оба',
  format: 'Тип промо-формата (определяет рендерер и набор контентных полей)',
  description: 'Текст описания промо',
  imageUrl: 'URL картинки промо',
  action: 'Кнопка призыва к действию (CTA)',
  'action.href': 'Ссылка перехода по клику на CTA-кнопку',
  'action.label': 'Подпись CTA-кнопки',
  ctaColor: 'Цвет фона CTA-кнопки (пусто = дефолт рендерера)',
  ctaTextColor: 'Цвет текста на CTA-кнопке (пусто = белый)',
  dismissible: 'Можно ли закрыть промо крестиком',
  backgroundColor: 'Цвет фона промо',
  textColor: 'Цвет текста промо',
  backgroundImage: 'URL фоновой картинки промо',
  backgroundGradient: 'Линейный градиент фона (каскадом с backgroundImage/backgroundColor)',
  'backgroundGradient.from': 'Начальный цвет градиента',
  'backgroundGradient.to': 'Конечный цвет градиента',
  'backgroundGradient.angle': 'Угол градиента, градусы (0–360)',
  textAlign: 'Горизонтальное выравнивание текста (left / center / right)',
  anchor: 'Якорь data-promo-anchor на странице — элемент, к которому привязан tooltip',
  steps: 'Шаги визарда (от 2 до 6)',
  'steps[].title': 'Заголовок шага (до 80 символов)',
  'steps[].body': 'Текст шага (до 240 символов)',
  'steps[].imageUrl': 'URL картинки/гифки шага (если пусто — показывается анимированная сцена хоста)',
  presentation: 'Режим показа визарда: модалка (modal, по умолчанию) или на весь экран (fullscreen)',
  divkitUrl: 'URL на JSON-вёрстку DivKit в S3 (production-вариант)',
  divkitJson: 'Инлайн JSON-вёрстка DivKit для превью до сохранения (в проде не хранится)',
  variant: 'Зарегистрированный host-компонент витрины (id из KNOWN_CUSTOM_VARIANTS)',
};

/** Краткое человеко-читаемое описание типа поля (для колонки «Тип» в таблице). */
function describeZodType(schema: z.ZodTypeAny): string {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def.typeName as string;

  switch (typeName) {
    case 'ZodString': {
      const checks = (def.checks as Array<{ kind: string }>) ?? [];
      if (checks.some((c) => c.kind === 'url')) return 'строка (URL)';
      if (checks.some((c) => c.kind === 'datetime')) return 'строка (ISO datetime)';
      return 'строка';
    }
    case 'ZodNumber':
      return 'число';
    case 'ZodBoolean':
      return 'булево';
    case 'ZodEnum': {
      // `|` — служебный разделитель колонок markdown-таблицы, поэтому
      // между значениями enum используем `/`, а не `|`.
      const values = (def.values as string[]) ?? [];
      return `enum(${values.join(' / ')})`;
    }
    case 'ZodLiteral':
      return `literal(${JSON.stringify(def.value)})`;
    case 'ZodArray': {
      const inner = describeZodType(def.type as z.ZodTypeAny);
      return `массив<${inner}>`;
    }
    case 'ZodEffects':
      // Refinements preserve the underlying storage type. This matters for
      // arrays of refined strings such as targeting.search.terms.
      return describeZodType(def.schema as z.ZodTypeAny);
    case 'ZodObject':
      return 'объект (см. под-поля ниже)';
    case 'ZodUnknown':
      return 'произвольное значение (unknown)';
    default:
      return typeName.replace(/^Zod/, '');
  }
}

/** Снимает ZodOptional/ZodDefault/ZodEffects(preprocess) обёртки и
 *  возвращает "голую" схему + признак опциональности, собранный по цепочке. */
function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean } {
  let current = schema as unknown as { _def: Record<string, unknown> };
  let optional = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const typeName = current._def.typeName as string;
    if (typeName === 'ZodOptional') {
      optional = true;
      current = (current._def.innerType as { _def: Record<string, unknown> });
    } else if (typeName === 'ZodDefault') {
      optional = true;
      current = (current._def.innerType as { _def: Record<string, unknown> });
    } else if (typeName === 'ZodEffects') {
      // z.preprocess(...) — реальный тип лежит в _def.schema.
      current = (current._def.schema as { _def: Record<string, unknown> });
    } else {
      break;
    }
  }
  return { inner: current as unknown as z.ZodTypeAny, optional };
}

interface FieldRow {
  path: string;
  type: string;
  required: boolean;
  description: string;
}

/** Разворачивает одно поле схемы (и — рекурсивно — под-поля вложенных
 *  объектов/массивов объектов) в плоский список строк таблицы. */
function flattenField(key: string, rawSchema: z.ZodTypeAny, parentPath: string | null): FieldRow[] {
  const path = parentPath ? `${parentPath}.${key}` : key;
  const { inner, optional } = unwrap(rawSchema);
  const innerDef = (inner as unknown as { _def: Record<string, unknown> })._def;
  const typeName = innerDef.typeName as string;

  const description = FIELD_DESCRIPTIONS[path] ?? '—';
  const row: FieldRow = { path, type: describeZodType(inner), required: !optional, description };

  if (typeName === 'ZodObject') {
    const shape = (inner as z.ZodObject<any>).shape;
    const children = Object.entries(shape).flatMap(([childKey, childSchema]) =>
      flattenField(childKey, childSchema as z.ZodTypeAny, path),
    );
    return [row, ...children];
  }

  if (typeName === 'ZodArray') {
    const elementType = innerDef.type as z.ZodTypeAny;
    const { inner: elementInner } = unwrap(elementType);
    const elementDef = (elementInner as unknown as { _def: Record<string, unknown> })._def;
    if ((elementDef.typeName as string) === 'ZodObject') {
      const arrayPath = `${path}[]`;
      const shape = (elementInner as z.ZodObject<any>).shape;
      const children = Object.entries(shape).flatMap(([childKey, childSchema]) =>
        flattenField(childKey, childSchema as z.ZodTypeAny, arrayPath),
      );
      return [row, ...children];
    }
  }

  return [row];
}

function renderTable(rows: FieldRow[]): string {
  const header = '| Поле | Тип | Обязательность | Описание |\n|---|---|---|---|';
  const body = rows
    .map((r) => `| \`${r.path}\` | ${r.type} | ${r.required ? 'обязательно' : 'опционально'} | ${r.description} |`)
    .join('\n');
  return `${header}\n${body}`;
}

/** Формат-специфичные примечания об обязательности, которая проверяется не
 *  самой schema.ts-схемой, а формой/бизнес-логикой поверх неё. */
const FORMAT_NOTES: Partial<Record<PromoFormat, string[]>> = {
  tooltip: ['`anchor` — обязательное поле схемы (не просто форма): якорь должен существовать в CANONICAL_ANCHORS.'],
  multistep: ['`steps` — обязателен, от 2 до 6 шагов (ограничение схемы: `.min(2).max(6)`).'],
  custom: [
    '`variant` — обязателен и должен входить в `KNOWN_CUSTOM_VARIANTS` (проверяется `.refine()` в схеме).',
    'variant `referral-invite`: поля `referral*` (копейки/целые числа) не рендерятся на сайте — promo-bff зеркалит их (best-effort upsert) в abkhaz-Supabase `referral_config` (id=1) при сохранении промо.',
  ],
  divkit: [
    '`divkitUrl` и `divkitJson` оба опциональны в схеме (storage-контракт), но на форме обязателен хотя бы один из них: `divkitUrl || divkitJson`.',
  ],
};

/** Генерирует полный markdown-документ по текущим SCHEMA_BY_FORMAT/CONTENT_KEYS_BY_FORMAT. */
export function generateFormatDocs(): string {
  const lines: string[] = [];

  lines.push('<!-- сгенерировано скриптом scripts/generate-format-docs.ts, не редактировать руками -->');
  lines.push('<!-- команда: npm run docs:formats -->');
  lines.push('');
  lines.push('# Схемы промо-форматов');
  lines.push('');
  lines.push(
    'Справочник по полям каждого из 8 типов промо (`src/lib/schema.ts`, `SCHEMA_BY_FORMAT`/`CONTENT_KEYS_BY_FORMAT`). ' +
      'Документ описывает форму zod-схемы «как есть»: тип поля, обязательность на уровне схемы и русское описание назначения.',
  );
  lines.push('');

  lines.push('## Общие поля (serving) — одинаковы для всех форматов');
  lines.push('');
  lines.push(
    'Слой 1 схемы — таргетинг/расписание/частота показов. Именно эти поля BFF использует для отбора кандидата до рендера контента.',
  );
  lines.push('');
  const servingRows = Object.entries(servingBlockSchema.shape).flatMap(([key, schema]) =>
    flattenField(key, schema as z.ZodTypeAny, null),
  );
  lines.push(renderTable(servingRows));
  lines.push('');

  for (const format of promoFormats) {
    const label = FORMAT_LABEL[format];
    const schema = SCHEMA_BY_FORMAT[format];
    const contentKeys = CONTENT_KEYS_BY_FORMAT[format];

    lines.push(`## ${label.name} — ${label.sub}`);
    lines.push('');

    const notes = FORMAT_NOTES[format];
    if (notes) {
      for (const note of notes) lines.push(`> ${note}`);
      lines.push('');
    }

    if (contentKeys.length === 0) {
      lines.push('_У этого формата нет контентных полей сверх общего serving-блока._');
      lines.push('');
      continue;
    }

    const rows = contentKeys.flatMap((key) => flattenField(key, schema.shape[key], null));
    lines.push(renderTable(rows));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

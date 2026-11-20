import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import exifr from 'exifr';
import { Upload, MapPin, Loader2, AlertCircle, CheckCircle2, ImageIcon } from 'lucide-react';
import MiniMapPicker from '@/components/MiniMapPicker';
import { insertPlace } from '@/lib/places';
import { CATEGORY_LIST, categoryConfig } from '@/lib/categories';
import type { Place } from '@/lib/types';

interface ExtractedExif {
  latitude: number;
  longitude: number;
}

export default function SubmitPlace() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('hidden_gem');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [manualCoords, setManualCoords] = useState('');
  const [exifStatus, setExifStatus] = useState<'idle' | 'checking' | 'found' | 'missing'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setExifStatus('checking');
    try {
      const gps = (await exifr.gps(file)) as ExtractedExif | undefined;
      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        setLat(gps.latitude);
        setLng(gps.longitude);
        setExifStatus('found');
      } else {
        setExifStatus('missing');
      }
    } catch {
      setExifStatus('missing');
    }
  }

  function handleManualCoords(value: string) {
    setManualCoords(value);
    const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (match) {
      const la = parseFloat(match[1]);
      const ln = parseFloat(match[2]);
      if (Math.abs(la) <= 90 && Math.abs(ln) <= 180) {
        setLat(la);
        setLng(ln);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lat === null || lng === null) {
      setError('Укажите местоположение: загрузите фото с GPS, поставьте точку на мини-карте или введите координаты.');
      return;
    }
    setSubmitting(true);
    try {
      const place = await insertPlace({
        title: title.trim(),
        description: description.trim(),
        category,
        lat,
        lng,
        image_url: imageUrl,
      });
      navigate('/', { state: { focusPlaceId: place.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить место.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Добавить место</h1>
        <p className="mt-2 text-stone-600">
          Знаете место, которым стоит поделиться? Добавьте его на карту, чтобы его нашли другие.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl bg-white p-6 shadow-card sm:p-8">
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-semibold text-stone-800">
            Название
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder="Например: Тайный дворик на Соборной"
            className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-stone-900 placeholder-stone-400 outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-stone-800">
            Описание <span className="font-normal text-stone-500">— история или чем место особенно</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={5}
            maxLength={2000}
            placeholder="Расскажите историю этого места…"
            className="w-full resize-y rounded-xl border border-stone-200 px-4 py-2.5 text-stone-900 placeholder-stone-400 outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
          />
        </div>

        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-semibold text-stone-800">
            Категория
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-stone-900 outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
          >
            {CATEGORY_LIST.map((c) => (
              <option key={c} value={c}>
                {categoryConfig(c).label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-stone-800">Фото</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-stone-200 px-4 py-8 text-stone-500 transition hover:border-forest-400 hover:bg-forest-50/50 hover:text-forest-700"
          >
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" className="h-32 w-full rounded-lg object-cover" />
            ) : (
              <>
                <Upload className="h-7 w-7" />
                <span className="text-sm font-medium">Загрузите фото места</span>
                <span className="text-xs text-stone-400">
                  Координаты попробуем определить из GPS-данных фотографии
                </span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-stone-800">Местоположение</span>
          {exifStatus === 'checking' && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Ищу GPS-данные в фотографии…
            </p>
          )}
          {exifStatus === 'found' && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-forest-50 px-4 py-3 text-sm text-forest-800">
              <CheckCircle2 className="h-4 w-4" /> Координаты найдены в GPS-данных фото
            </p>
          )}
          {exifStatus === 'missing' && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0" /> В фото нет GPS-данных — поставьте точку на карте
              ниже или введите координаты (широта, долгота)
            </p>
          )}
          {exifStatus === 'idle' && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
              <ImageIcon className="h-4 w-4" /> Добавьте фото с геоданными или укажите место вручную ниже
            </p>
          )}
          <MiniMapPicker
            lat={lat}
            lng={lng}
            onChange={(la, ln) => {
              setLat(la);
              setLng(ln);
              setManualCoords(`${la.toFixed(5)}, ${ln.toFixed(5)}`);
            }}
          />
          <input
            type="text"
            value={manualCoords}
            onChange={(e) => handleManualCoords(e.target.value)}
            placeholder="Или вставьте координаты: 51.5336, 46.0343"
            className="mt-3 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 outline-none transition focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
          />
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-forest-800 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Сохраняю…
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4" /> Добавить на карту
            </>
          )}
        </button>
      </form>
    </div>
  );
}

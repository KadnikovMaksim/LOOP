import { Compass, Map, Users, Footprints, Camera, Github } from 'lucide-react';

const features = [
  {
    icon: Map,
    title: 'Explore the map',
    text: 'Browse a hand-picked collection of monuments, scenic viewpoints, cafes, and hidden gems — each with its story told.',
  },
  {
    icon: Footprints,
    title: 'Build your route',
    text: 'Pick a start, a finish, and the stops in between. The route builder threads your walk through every place you choose.',
  },
  {
    icon: Camera,
    title: 'Share your discoveries',
    text: 'Found somewhere special? Submit it with a photo. If your picture has GPS data, we place it on the map automatically.',
  },
];

export default function About() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-700 text-white">
          <Compass className="h-6 w-6" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">О проекте</h1>
      </div>

      <p className="mt-6 text-lg leading-relaxed text-stone-600">
        Это интерактивный путеводитель для тех, кто любит гулять по городу, а не листать его.
        Он объединяет планирование маршрута с историями о местах: у каждой точки на карте есть
        описание, характер и причина свернуть с прямого пути.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl bg-white p-6 shadow-card">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-semibold text-stone-900">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-forest-700 p-8 text-white">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h2 className="font-semibold">Built by explorers, for explorers</h2>
        </div>
        <p className="mt-3 leading-relaxed text-forest-50">
          The guide starts with a seed collection of classic landmarks, but its real texture comes from
          the community: the quiet courtyards, the best sunset benches, the cafe where the poet used to
          sit. Every place you submit is added to the shared map for the next traveller.
        </p>
      </div>

      <p className="mt-10 flex items-center gap-2 text-sm text-stone-400">
        <Github className="h-4 w-4" />
        Map data © OpenStreetMap contributors · Routing by OSRM
      </p>
    </div>
  );
}

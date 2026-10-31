// Accept a capability identifier, never executable code or caller-provided deltas.
export function validateCommand(input) {
  try {
    if (!input || typeof input !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) return null;
    const keys = Reflect.ownKeys(input);
    if (keys.length!==2 || !keys.includes('kind') || !keys.includes('id')) return null;
    const kind = Object.getOwnPropertyDescriptor(input,'kind');
    const id = Object.getOwnPropertyDescriptor(input,'id');
    if (!kind || !id || !('value' in kind) || !('value' in id) || kind.value!=='experiment' || typeof id.value!=='string' || id.value.length>80 || !EXPERIMENTS.some(e=>e.id===id.value)) return null;
    return {kind:'experiment',id:id.value};
  } catch { return null; }
}

const OUTCOMES = Object.freeze({
  'quantum-coffee': ['coffee',-5,7,'Сонливость схлопнулась, причинность проснулась.','Чашка наблюдает оператора; оператор теряет определённость.'],
  'gravity-knot': ['gravity',-9,14,'Свободное падение аккуратно привязано к стулу.','Узел развязался, мебель падает вверх по служебной лестнице.'],
  'alien-tea': ['alien',-6,9,'Посол подписал мирный договор чайной ложкой.','Чайник ввёл санкции против кипятка.'],
  'vacuum-budget': ['money',-8,16,'Несуществующие расходы возвращены в небытие.','Пустота обесценилась и требует компенсации.'],
  'paradox-fridge': ['chaos',-15,24,'Парадокс заморожен до выяснения причин.','Вчера разморозилось и затопило завтрашнюю смену.'],
  'probability-iron': ['chaos',-10,13,'Складка будущего исчезла без потери вторника.','Будущее прилипло к утюгу и шипит предсказаниями.'],
  'silence-engine': ['coffee',-4,6,'Невысказанные замечания стабилизировали лабораторию.','Все замечания прозвучали одновременно; стены спорят.'],
  'double-boris': ['chaos',-18,28,'Зеркальный Борис согласился работать только по выходным.','Два Бориса объявили друг друга тестовой версией реальности.'],
});

// First draw chooses success, second independently chooses the 3.5% rare twist.
// IDs identify event sources; V1 applyEvent supplies occurrence IDs and timestamps.
export function resolveExperiment(id, rng = Math.random) {
  const experiment = EXPERIMENTS.find(item=>item.id===id);
  if (!experiment) return null;
  const draw = () => { const value=rng(); return Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : 1; };
  const success = draw()<experiment.probability;
  const rare = draw()<0.035;
  const [type,good,bad,goodText,badText] = OUTCOMES[id];
  const delta = success ? good : bad;
  return {
    event:{id:`experiment-${id}-${success ? 'success' : 'failure'}${rare ? '-rare' : ''}`,type,title:rare ? `${experiment.title}: альтернативный Борис` : `${experiment.title}: ${success ? 'успех' : 'сбой'}`,description:(success ? goodText : badText)+(rare ? ' Из бокового измерения вышел второй Борис с журналом событий, которые ещё не произошли. Он требует отдельную кружку и право вето.' : ''),emoji:rare ? '🪞' : experiment.emoji,delta,animation:experiment.animation,...(rare ? {sourceId:'double-boris'} : {})},
    success,rare,catastrophic:delta>=20,experimentId:id,
  };
}

export const EXPERIMENTS = Object.freeze([
  {id:'quantum-coffee',title:'Квантовый эспрессо',description:'Наблюдать чашку до схлопывания сонливости.',probability:0.82,risk:'low',consequences:'Успех: −5 хаоса. Сбой: +7, чашка наблюдает оператора.',animation:'quantum',emoji:'☕'},
  {id:'gravity-knot',title:'Узел на гравитации',description:'Привязать свободное падение к лабораторному стулу.',probability:0.64,risk:'medium',consequences:'Успех: −9 хаоса. Сбой: +14, мебель падает вверх.',animation:'gravity',emoji:'🪐'},
  {id:'alien-tea',title:'Чай с послом',description:'Уточнить мирные намерения неизвестного чайника.',probability:0.74,risk:'low',consequences:'Успех: −6 хаоса. Сбой: +9, чайник объявляет санкции.',animation:'tea',emoji:'👽'},
  {id:'vacuum-budget',title:'Бюджет вакуума',description:'Провести аудит средств, которых никогда не было.',probability:0.60,risk:'medium',consequences:'Успех: −8 хаоса. Сбой: +16, инфляция пустоты.',animation:'money',emoji:'💸'},
  {id:'paradox-fridge',title:'Холодильник парадоксов',description:'Охладить следствие прежде, чем появится причина.',probability:0.48,risk:'high',consequences:'Успех: −15 хаоса. Сбой: +24, вчера размораживается.',animation:'freeze',emoji:'🧊'},
  {id:'probability-iron',title:'Утюг вероятностей',description:'Разгладить складку на ближайшем будущем.',probability:0.68,risk:'medium',consequences:'Успех: −10 хаоса. Сбой: +13, будущее прилипает.',animation:'iron',emoji:'🧷'},
  {id:'silence-engine',title:'Двигатель тишины',description:'Запитать стабилизатор от невысказанных замечаний Бориса.',probability:0.86,risk:'low',consequences:'Успех: −4 хаоса. Сбой: +6, замечания выходят хором.',animation:'silence',emoji:'🔇'},
  {id:'double-boris',title:'Запасной Борис',description:'Спросить зеркального Бориса, нужен ли второй Борис.',probability:0.40,risk:'high',consequences:'Успех: −18 хаоса. Сбой: +28, два администратора реальности.',animation:'double',emoji:'🪞'},
].map(Object.freeze));

import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {randomInt} from 'node:crypto';
const app=express();const http=createServer(app);const io=new Server(http);app.use(express.static('public'));
const rooms=new Map();const clean=s=>String(s??'').trim().slice(0,32);
const state=r=>({code:r.code,started:r.started,caseIndex:r.caseIndex,teams:[...r.teams.values()].map(t=>({name:t.name,score:t.score,solved:t.solved,clues:t.clues,joined:t.members.size})).sort((a,b)=>b.score-a.score),finished:r.finished});
const broadcast=r=>{io.to(r.code).emit('state',state(r));for(const t of r.teams.values()){const p=t.progress[r.caseIndex]||{clues:[],hints:[],solved:false};for(const id of t.members)io.to(id).emit('progress',{clues:p.clues,hints:p.hints,solved:p.solved,clueTexts:p.clues.map(i=>({index:i,text:CASES[r.caseIndex].clues[i]})),hintTexts:p.hints.map(i=>({index:i,text:CASES[r.caseIndex].hints[i].text}))})}};
io.on('connection',s=>{
 const get=()=>rooms.get(s.data.code);const reply=(ack,obj)=>typeof ack==='function'&&ack(obj);
 s.on('create',({team},ack)=>{team=clean(team);if(!team)return reply(ack,{error:'اكتب اسم الفريق'});let code;do{code=String(randomInt(100000,1000000))}while(rooms.has(code));const r={code,host:s.id,started:false,caseIndex:0,finished:false,teams:new Map()};rooms.set(code,r);join(r,team,s);reply(ack,{ok:true,code});broadcast(r)});
 s.on('join',({code,team},ack)=>{const r=rooms.get(String(code));team=clean(team);if(!r)return reply(ack,{error:'رمز الغرفة غير صحيح'});if(!team)return reply(ack,{error:'اكتب اسم الفريق'});join(r,team,s);reply(ack,{ok:true,code:r.code});broadcast(r)});
 function join(r,team,s){if(s.data.code)s.leave(s.data.code);s.join(r.code);s.data={code:r.code,team};if(!r.teams.has(team))r.teams.set(team,{name:team,score:0,solved:0,clues:0,members:new Set(),progress:{}});r.teams.get(team).members.add(s.id)}
 s.on('start',(_,ack)=>{const r=get();if(!r||r.host!==s.id)return reply(ack,{error:'فقط منشئ الغرفة يبدأ الجولة'});r.started=true;broadcast(r);reply(ack,{ok:true})});
 s.on('action',({type,index,answer},ack)=>{const r=get(),t=r?.teams.get(s.data.team);if(!r||!t||!r.started||r.finished)return reply(ack,{error:'الجولة غير متاحة'});const c=CASES[r.caseIndex];const p=t.progress[r.caseIndex]??={clues:[],hints:[],solved:false};if(type==='clue'){
 if(!Number.isInteger(index)||index<0||index>=7)return reply(ack,{error:'دليل غير صالح'});if(p.clues.includes(index))return reply(ack,{ok:true});const gate=c.gates[index];if(normal(answer)!==normal(gate.answer)){t.score=Math.max(0,t.score-5);broadcast(r);return reply(ack,{error:'إجابة التحدي غير صحيحة، خُصمت 5 نقاط'})}p.clues.push(index);t.clues++;t.score+=15;reply(ack,{ok:true});
 }else if(type==='hint'){
 if(!Number.isInteger(index)||index<0||index>=3)return reply(ack,{error:'تلميح غير صالح'});if(p.hints.includes(index))return reply(ack,{ok:true});if(p.clues.length<c.hints[index].need)return reply(ack,{error:`اجمع ${c.hints[index].need} أدلة أولًا`});if(normal(answer)!==normal(c.hints[index].answer)){t.score=Math.max(0,t.score-5);broadcast(r);return reply(ack,{error:'حل تحدي التلميح غير صحيح، خُصمت 5 نقاط'})}p.hints.push(index);t.score=Math.max(0,t.score-10);reply(ack,{ok:true});
 }else if(type==='solve'){
 if(p.solved)return reply(ack,{error:'تم حل هذه القضية'});if(p.clues.length<7)return reply(ack,{error:'يجب جمع الأدلة السبعة'});if(normal(answer)!==normal(c.solution)){t.score=Math.max(0,t.score-20);broadcast(r);return reply(ack,{error:'الاستنتاج غير صحيح، خُصمت 20 نقطة'})}p.solved=true;t.solved++;t.score+=100;reply(ack,{ok:true});
 }else return reply(ack,{error:'إجراء غير معروف'});broadcast(r)});
 s.on('next',(_,ack)=>{const r=get();if(!r||r.host!==s.id)return reply(ack,{error:'فقط منشئ الغرفة ينتقل للقضية التالية'});if(r.caseIndex<CASES.length-1)r.caseIndex++;else r.finished=true;broadcast(r);reply(ack,{ok:true})});
 s.on('disconnect',()=>{const r=get(),t=r?.teams.get(s.data.team);if(!r||!t)return;t.members.delete(s.id);if(r.host===s.id){const ids=[...r.teams.values()].flatMap(x=>[...x.members]);r.host=ids[0]??null;if(r.host)io.to(r.host).emit('host')}broadcast(r);if(![...r.teams.values()].some(x=>x.members.size))rooms.delete(r.code)})
});
function normal(s){return String(s??'').trim().toLocaleLowerCase('ar').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ')}
const raw=[
['سرقة المخطوطة','اختفت مخطوطة نادرة من مكتبة مغلقة أثناء انقطاع قصير للكهرباء. ثلاثة موظفين كانوا قريبين، لكن مسار الدخول وسجل الإضاءة يكشفان من استطاع تجاوز الخزانة.','أمين الأرشيف','حارس الليل','مديرة المكتبة','فني الكهرباء'],
['ساعة المتحف','توقفت ساعة أثرية في معرض خاص، ثم اختفى مفتاح صندوق التبرعات. تسجيلات الكاميرا متعارضة بفارق دقائق.','مرمم الساعات','المرشد','المصور','موظف الاستقبال'],
['الرسالة المشفرة','وصلت رسالة مجهولة إلى المختبر قبل اختفاء عينة بحثية. لم يُكسر أي قفل، لكن جهاز التبريد سُجل مفتوحًا.','مساعد المختبر','الباحث','المحاسب','عامل الصيانة'],
['لغز القطار الأخير','اختفت حقيبة وثائق من مقصورة القطار. كل راكب يذكر محطة مختلفة، وبطاقة الصعود وحدها لا تكفي.','مراقب التذاكر','الراكب الأول','بائع القهوة','المهندس'],
['ظلال المسرح','قبل العرض بدقائق اختفى نص مسرحي أصلي. كانت أبواب الكواليس مقفلة لكن أحدهم بدّل جدول الإضاءة.','مسؤول الإضاءة','المخرج','الممثل','مصممة الأزياء'],
['سر الصندوق الأزرق','عُثر على صندوق فارغ في مخزن الميناء. أختام الشحن سليمة لكن الوزن المدون لا يطابق السجلات.','كاتب الشحن','القبطان','السائق','المفتش'],
['اختفاء الخريطة','فقدت خريطة تاريخية خلال مؤتمر جغرافي. بطاقة دخول واحدة استُخدمت مرتين، والنسخة المعروضة كانت مقلدة.','منسق المعرض','الخبير','الضيف','المترجم'],
['مفتاح البرج','أُغلق برج المراقبة من الداخل، ثم فُقد سجل المناوبات. دليل الصوت يناقض وقت تسجيل الحارس.','مشغل البرج','الحارس','الزائر','الفني'],
['شفرة الحديقة','اختفى تمثال صغير من حديقة أثرية. آثار الطين تشير إلى عربة نقل لكن مسارها يبدو مستحيلًا.','مشرف الري','البستاني','الزائر','المرمم'],
['القضية الأخيرة','في الأرشيف المركزي اختفت وثيقة تجمع أدلة القضايا السابقة. على الفرق مطابقة التوقيت والختم والممر السري.','مدير الأرشيف','المحقق','السكرتير','المراقب']
];
const CASES=raw.map((r,k)=>{const [title,story,culprit,...others]=r;const n=k+1;
 const gates=[
 {q:`سجل الدخول مشفّر بإزاحة رقمية: 14، 19، 26، 35، ؟. ما العدد التالي؟`,answer:'46'},
 {q:`كاميرا أبطأ من الوقت الحقيقي بـ ${n+3} دقائق. تعرض 21:17. اكتب الوقت الحقيقي بصيغة ساعة:دقيقة.`,answer:`21:${String(20+n).padStart(2,'0')}`},
 {q:'ثلاث شهادات: أ يقول «ب كاذب»، ب يقول «ج كاذب»، ج يقول «أ وب كاذبان». إذا كان شخص واحد فقط صادقًا، فمن هو؟ اكتب أ أو ب أو ج.',answer:'ب'},
 {q:`وجد المحقق رموزًا 3، 8، 15، 24، 35. ما الرمز السادس؟`,answer:'48'},
 {q:'قفل من 3 خانات: 682 (رقم صحيح وفي مكانه)، 614 (رقم صحيح ولكن في غير مكانه)، 206 (رقمان صحيحان ولكن في غير مكانيهما)، 738 (لا رقم صحيح)، 780 (رقم صحيح ولكن في غير مكانه). ما الرمز؟',answer:'042'},
 {q:`تُظهر السجلات 4 مروريات: 08:05، 08:17، 08:29، 08:41. إذا استمر النمط، متى المرور التالي؟`,answer:'08:53'},
 {q:'في كشف الحضور: كل من حمل البطاقة الحمراء دخل المخزن. سارة دخلت المخزن. هل نستنتج بالضرورة أن سارة حملت البطاقة الحمراء؟ أجب نعم أو لا.',answer:'لا'}];
 const clues=[`سجل البوابة يثبت أن ${others[0]} غادر قبل بدء الحادث، لكن توقيت البوابة يحتاج معايرة.`,`بصمة على المزلاج تخص ${culprit}، لكن لا يوجد ما يثبت وقت تركها.`,`سجل الدخول يُظهر أن ${others[1]} استخدم بطاقة مختلفة في طابق آخر، ولا يكفي وحده لإثبات مكانه.`,`تقرير الإضاءة يحدد انقطاعًا استمر ${n+2} دقائق، بينما ساعة إحدى الكاميرات متأخرة.`,`شاهدان وضعا ${others[2]} أمام الجمهور وقت الاختفاء، لكن شهادتيهما مأخوذتان من زاوية واحدة.`,`تعديل بخط ${culprit} على ورقة المناوبة يثبت الوصول إلى جدول فتح الخزانة، لكنه لا يثبت السرقة وحده.`,`بعد تصحيح فارق الساعة، تتطابق حركة بطاقة ${culprit} مع وقت استخدام المفتاح؛ ويؤكد سجل مستقل فتح الخزانة في اللحظة نفسها.`];
 const hints=[{need:2,q:'للحصول على التلميح: 5، 11، 23، 47، ؟',answer:'95',text:'حدد أولًا أي ساعة تحتاج إلى تصحيح، ولا تعتمد على البصمة وحدها.'},{need:4,q:'للحصول على التلميح: في منطق القضايا، هل نفي النتيجة يثبت نفي السبب دائمًا؟ أجب نعم أو لا.',answer:'لا',text:'استبعد الاحتمالات فقط عندما تجد دليلين مستقلين على الأقل.'},{need:6,q:'للحصول على التلميح: رمز يتبع 1²+1، 2²+1، 3²+1، 4²+1؛ ما الحد الخامس؟',answer:'26',text:'قارن البطاقة والمفتاح وتوقيت الكاميرا بعد تصحيحه.'}];return {title,story,culprit,solution:culprit,gates,clues,hints}});
app.get('/api/cases',(req,res)=>res.json(CASES.map(({title,story,gates,hints},i)=>({title,story,gates:gates.map(x=>({q:x.q})),hints:hints.map(({need,q})=>({need,q})),index:i}))));
app.get('/api/health',(req,res)=>res.json({ok:true}));
http.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Game server ready'));

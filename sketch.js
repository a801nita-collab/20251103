// 測驗系統（改良版）：支援 CSV 上傳、答案選取特效、依分數顯示不同動畫
let questions = [];
let quiz = [];
let current = 0;
let score = 0;
let state = 'idle'; // idle, running, finished

// UI 元件
let btnDownload, btnStart, infoDiv, choicesDiv, resultDiv, retryBtn, fileInput, sampleBtn;
let centerPanelEl = null;
let controlDiv = null;

// 視覺效果粒子
let particles = [];
let selectionParticles = [];
let endParticles = [];

// 動畫模式（finish 時使用）
let endMode = null; // 'praise' | 'encourage' | 'tryagain'

function setup() {
	createCanvas(windowWidth, windowHeight);
	// 若系統沒有該字型，p5 會 fallback
	try{ textFont('Noto Sans TC'); }catch(e){}
	setupSampleQuestions();
	createUI();
	adjustLayout();

	// 嘗試自動載入同目錄下的 question_bank.csv（需透過 HTTP server）
	try{
		fetch('question_bank.csv')
		.then(resp=>{ if (!resp.ok) throw new Error('no file'); return resp.text(); })
		.then(text=>{
			if (text && text.length>10){
				if (loadQuestionsFromCSVText(text)){
					infoDiv.html('自動載入 question_bank.csv，共 '+questions.length+' 題');
					// refresh layout if needed
					adjustLayout();
				}
			}
		})
		.catch(e=>{
			// 靜默失敗（檔案不存在或 fetch 不允許）
		});
	}catch(e){}
}

function windowResized(){
	resizeCanvas(windowWidth, windowHeight);
	adjustLayout();
}

// 根據視窗寬度調整字體大小與按鈕排列
function adjustLayout(){
	// centerPanel 相關字級
	const w = windowWidth;
	const baseQSize = Math.max(16, Math.round(map(w, 320, 1400, 16, 26)));
	const baseBtnSize = Math.max(14, Math.round(map(w, 320, 1400, 14, 18)));
	// 調整 title/info 字級
	const leftPanel = select('#leftPanel');
	if (leftPanel) {
		leftPanel.style('font-size', Math.round(baseBtnSize-2)+'px');
	}
	// 若 centerPanel 存在，調整 choices 的排版
	const center = select('#centerPanel');
	if (center){
		// 先確保 choicesDiv 存在
		if (choicesDiv){
			// 決定要用 grid 兩欄還是 list 單欄
			if (w > 700){
				choicesDiv.elt.classList.remove('choices-list');
				choicesDiv.elt.classList.add('choices-grid');
			} else {
				choicesDiv.elt.classList.remove('choices-grid');
				choicesDiv.elt.classList.add('choices-list');
			}
			// 調整已存在按鈕的樣式
			const btns = choicesDiv.elt.querySelectorAll('button');
			btns.forEach(b=>{
				b.style.fontSize = baseBtnSize+'px';
				b.style.padding = (baseBtnSize>=18? '14px':'10px');
			});
		}
		// question 大小也調整
		const qEls = center.elt.querySelectorAll('div');
		qEls.forEach(el=>{ el.style.fontSize = baseQSize+'px'; });
	}
}

function draw() {
	// 背景漸層
	setGradientBackground();

	// 更新並繪製主要粒子
	for (let i = particles.length - 1; i >= 0; i--) {
		particles[i].update();
		particles[i].draw();
		if (particles[i].isDead()) particles.splice(i, 1);
	}

	// 繪製選取粒子
	for (let i = selectionParticles.length - 1; i >= 0; i--) {
		selectionParticles[i].update();
		selectionParticles[i].draw();
		if (selectionParticles[i].isDead()) selectionParticles.splice(i, 1);
	}

	// 結果動畫粒子
	for (let i = endParticles.length - 1; i >= 0; i--) {
		endParticles[i].update();
		endParticles[i].draw();
		if (endParticles[i].isDead()) endParticles.splice(i, 1);
	}

	// 自訂 canvas 游標（只在 canvas 區域）
	drawCustomCursor();

	// 若測驗結束，維持或更新結束動畫
	if (state === 'finished') {
		updateEndAnimation();
	}
}

// ---------------- CSV 處理 ----------------
function setupSampleQuestions(){
	// 保留舊 sample，作為使用者未上傳時的備援
	questions = [
		{id:1, question:'p5.js是什麼?', choices:['一個繪圖函式庫','一種咖啡品牌','一種汽車型號','一種水果'], answer:0, explanation:"一個繪圖函式庫庫"},
		{id:2, question:'水的化學式為何？', choices:['H2O','CO2','O2','NaCl'], answer:0, explanation:'水的化學式是 H2O。'},
		{id:3, question:'地球繞太陽一周大約需多久？', choices:['1 年','1 個月','1 星期','1 天'], answer:0, explanation:'地球繞太陽約需一個太陽年（約365天）。'},
		{id:4, question:'下列哪個是質數？', choices:['15','21','17','9'], answer:2, explanation:'17 是質數。'},
		{id:5, question:'光速大約為每秒多少公里？', choices:['300,000 km/s','30,000 km/s','3,000 km/s','300 km/s'], answer:0, explanation:'光速約為 300,000 公里/秒。'}
	];
}

function parseCSV(text){
	// 簡單 CSV 解析器：支援雙引號內的逗號與雙引號逃脫
	const rows = [];
	let cur = '';
	let row = [];
	let inQuotes = false;
	for (let i = 0; i < text.length; i++){
		const ch = text[i];
		const next = text[i+1];
		if (ch === '"'){
			if (inQuotes && next === '"'){
				// escaped quote
				cur += '"';
				i++; // skip next
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === ',' && !inQuotes){
			row.push(cur);
			cur = '';
		} else if ((ch === '\n' || ch === '\r') && !inQuotes){
			// handle CRLF
			if (cur !== '' || row.length > 0){
				row.push(cur);
				rows.push(row);
				row = [];
				cur = '';
			}
			// skip if CRLF pair
			if (ch === '\r' && next === '\n') i++;
		} else {
			cur += ch;
		}
	}
	if (cur !== '' || row.length > 0){ row.push(cur); rows.push(row); }
	return rows;
}

function loadQuestionsFromCSVText(text){
	const rows = parseCSV(text).filter(r=>r.length>0);
	if (rows.length <= 1) return false; // 沒有資料
	// assume header in first row
	const header = rows[0].map(h=>h.trim().toLowerCase());
	const idx = (name)=> header.indexOf(name);
	const idIdx = idx('id');
	const qIdx = idx('question');
	const aIdx = idx('answer');
	const eIdx = idx('explanation');
		// 支援不同欄位名稱：choiceA / optionA / a
		const cA = idx('choicea') >= 0 ? idx('choicea') : (idx('optiona')>=0? idx('optiona') : idx('a'));
		const cB = idx('choiceb') >= 0 ? idx('choiceb') : (idx('optionb')>=0? idx('optionb') : idx('b'));
		const cC = idx('choicec') >= 0 ? idx('choicec') : (idx('optionc')>=0? idx('optionc') : idx('c'));
		const cD = idx('choiced') >= 0 ? idx('choiced') : (idx('optiond')>=0? idx('optiond') : idx('d'));
	const loaded = [];
	for (let i = 1; i < rows.length; i++){
		const r = rows[i];
		if (!r[qIdx]) continue;
			let choices = [];
			if (cA>=0) choices.push(r[cA]||'');
			if (cB>=0) choices.push(r[cB]||'');
			if (cC>=0) choices.push(r[cC]||'');
			if (cD>=0) choices.push(r[cD]||'');
			// 若沒找到標準欄位，嘗試從欄位中推斷選項（抓 question 之後到 answer 之前的欄位）
			if (choices.length === 0){
				// 找到 question 與 answer 的 index 範圍
				let start = qIdx + 1;
				let end = (aIdx>=0 ? aIdx : rows[0].length-1);
				for (let k = start; k < end; k++){
					if (r[k] !== undefined && r[k] !== '') choices.push(r[k]);
				}
			}
		// 如果 CSV 沒有標明 answer 為 index，嘗試找字母或數字
		let answer = 0;
		if (aIdx>=0 && r[aIdx]){
			const val = r[aIdx].trim();
			if (/^[ABCDabcd]$/.test(val)) answer = val.toUpperCase().charCodeAt(0)-65;
			else answer = parseInt(val) || 0;
		}
		loaded.push({ id: (idIdx>=0? r[idIdx] : i), question: r[qIdx], choices, answer, explanation: (eIdx>=0? r[eIdx]: '') });
	}
	if (loaded.length>0){ questions = loaded; return true; }
	return false;
}

// ---------------- UI ----------------
function createUI(){
	// 使用中間面板作為控制與題目顯示區（左側選單已隱藏）
	let centerPanel = select('#centerPanel');
	if (!centerPanel) createDiv('').id('centerPanel');
	centerPanelEl = select('#centerPanel');
		// 建立一個 controlDiv 放置所有控制項（可整體隱藏）
		controlDiv = createDiv('').id('controlDiv');
		controlDiv.parent('centerPanel');
		// title / info 放在 controlDiv 中
		let title = createElement('h2', '隨機題庫測驗（每次 4 題）');
		title.parent(controlDiv);
		infoDiv = createDiv('上傳 CSV 或載入範例題庫，按「開始測驗」抽 4 題。CSV 欄位範例：id,question,choiceA,choiceB,choiceC,choiceD,answer,explanation');
		infoDiv.parent(controlDiv);
		infoDiv.style('font-size', '13px');

		// 檔案上傳（放 controlDiv）
		fileInput = createFileInput(handleFile);
		fileInput.parent(controlDiv);
		fileInput.elt.title = '上傳題庫 CSV';

		// 範例題庫按鈕（放 controlDiv）
		sampleBtn = createButton('載入範例題庫');
		sampleBtn.parent(controlDiv);
		sampleBtn.mousePressed(()=>{ setupSampleQuestions(); infoDiv.html('已載入範例題庫，共 '+questions.length+' 題'); });

		// 產生 CSV 的按鈕（放 controlDiv）
		btnDownload = createButton('下載題庫 CSV');
		btnDownload.parent(controlDiv);
		btnDownload.mousePressed(downloadCSV);

		// 開始測驗（放 controlDiv）
		btnStart = createButton('開始測驗');
		btnStart.parent(controlDiv);
		btnStart.mousePressed(startQuiz);

	// 顯示題目/選項與結果，放到 centerPanel 使其置中
	choicesDiv = createDiv('');
	choicesDiv.parent('centerPanel');
	choicesDiv.style('max-width', '680px');
	choicesDiv.style('text-align', 'center');

	resultDiv = createDiv('');
	resultDiv.parent('centerPanel');
	resultDiv.style('font-size','16px');

			retryBtn = createButton('重試');
			retryBtn.parent(controlDiv);
			retryBtn.mousePressed(()=>{ 
				state='idle'; score=0; infoDiv.html('按「開始測驗」抽題。'); choicesDiv.html(''); resultDiv.html(''); endMode=null; endParticles=[]; 
			});
}

function handleFile(file){
	if (!file || !file.data) { infoDiv.html('上傳失敗：無檔案'); return; }
	const ok = loadQuestionsFromCSVText(file.data);
	if (ok) infoDiv.html('CSV 解析成功，題庫共 '+questions.length+' 題');
	else infoDiv.html('CSV 解析失敗，請檢查欄位名稱與格式');
}

function downloadCSV(){
	// CSV 欄位：id,question,choiceA,choiceB,choiceC,choiceD,answer,explanation
	let lines = [];
	lines.push(['id','question','choiceA','choiceB','choiceC','choiceD','answer','explanation'].join(','));
	for (let q of questions){
		function esc(s){ if (s==null) return '""'; return '"'+String(s).replace(/"/g,'""')+'"'; }
		let row = [q.id, q.question, q.choices[0]||'', q.choices[1]||'', q.choices[2]||'', q.choices[3]||'', q.answer, q.explanation||''].map(esc).join(',');
		lines.push(row);
	}
	saveStrings(lines, 'question_bank.csv');
}

// ---------------- 測驗流程 ----------------
function startQuiz(){
	if (!questions || questions.length === 0){ infoDiv.html('題庫為空，請先上傳 CSV 或載入範例'); return; }
	quiz = sample(questions, min(4, questions.length));
	current = 0;
	score = 0;
	state = 'running';
	infoDiv.html('第 1 題，共 '+quiz.length+' 題');
	// 顯示置中題目面板並隱藏控制列（只留下題目與選項）
	if (centerPanelEl) centerPanelEl.style('display', 'block');
	if (controlDiv) controlDiv.hide();
	if (resultDiv) resultDiv.hide();
	showQuestion();
}

function sample(arr, k){
	let a = arr.slice();
	shuffle(a, true); // p5.js shuffle in-place
	return a.slice(0,k);
}

function showQuestion(){
	choicesDiv.html('');
	resultDiv.html('');
	if (current >= quiz.length) {
		finishQuiz();
		return;
	}
	let q = quiz[current];
	// 顯示題目、選項按鈕
	let qEl = createElement('div', '<strong>Q'+(current+1)+'.</strong> '+q.question);
		qEl.parent(choicesDiv);
		qEl.style('font-size','20px');
		qEl.style('margin-bottom','14px');
		qEl.style('text-align','center');

	for (let i=0;i<q.choices.length;i++){
		let b = createButton(String.fromCharCode(65+i)+'. '+q.choices[i]);
		b.parent(choicesDiv);
		b.addClass('option-btn');
		b.style('margin','6px 0');
		// 隨機 order 來改變顯示位置（grid 的 order 屬性）
		try{ b.elt.style.order = Math.floor(Math.random()*1000); }catch(e){}
		// 加入按鈕選取特效：產生粒子並在按下時禁用其他按鈕
			b.mousePressed(()=>{
			// 產生在按鈕位置的特效
			const rect = b.elt.getBoundingClientRect();
			createSelectionEffectAt(rect.left + rect.width/2, rect.top + rect.height/2, (i===q.answer)? color(0,200,100) : color(200,60,60));
			// disable native buttons to avoid double clicks
			const btns = choicesDiv.elt.querySelectorAll('button');
			btns.forEach(bb => bb.disabled = true);
			// 處理答案
			handleAnswer(i);
		});
	}
		// 調整按鈕及字級（因為新按鈕可能剛建立）
		adjustLayout();
}

function handleAnswer(choiceIndex){
	if (state !== 'running') return;
	let q = quiz[current];
	if (choiceIndex === q.answer){
		score++;
		resultDiv.html('<span style="color:green">答對！</span> '+q.explanation);
		// 中央粒子
		createParticles(color(0,200,100));
	} else {
		resultDiv.html(`
			<div style="margin-bottom: 10px;">
				<span style="color:red; font-weight: bold;">答錯</span>
			</div>
			<div style="background: #ffeeee; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
				<div style="font-weight: bold; color: #d32f2f; margin-bottom: 5px;">正確答案：</div>
				<div style="font-size: 1.1em;">${String.fromCharCode(65+q.answer)}. ${q.choices[q.answer]}</div>
			</div>
			<div style="color: #666;">${q.explanation}</div>
		`);
		createParticles(color(200,60,60));
	}
	current++;
	infoDiv.html('第 '+(current+1)+' 題，共 '+quiz.length+' 題');
	// 下一題延遲
	setTimeout(()=>{
		showQuestion();
	}, 900);
}

function finishQuiz(){
	state = 'finished';
	choicesDiv.html('');
	// 顯示結果，並恢復控制列
	const resultText = '測驗結束！ 得分：'+score+'/'+quiz.length;
	// 以醒目的樣式顯示正確題數
	resultDiv.html('<div style="text-align:center"><div style="font-size:28px; font-weight:700; margin-bottom:8px;">'+score+' / '+quiz.length+'</div><div style="font-size:16px;">'+resultText+'</div></div>');
	resultDiv.show();
	if (controlDiv) controlDiv.show();
	infoDiv.html('測驗完成。你可以按「重試」或下載題庫。');
	// 根據分數設定不同動畫模式
	if (score >= Math.ceil(quiz.length*0.75)) endMode = 'praise';
	else if (score >= Math.ceil(quiz.length*0.4)) endMode = 'encourage';
	else endMode = 'tryagain';
	startEndAnimation(endMode);
}

// ---------------- 視覺 / 特效 ----------------

function setGradientBackground(){
	// 垂直漸層
	for (let i=0;i<height;i++){
		let inter = map(i, 0, height, 0, 1);
		let c = lerpColor(color(35, 102, 255), color(120, 200, 255), inter);
		stroke(c);
		line(0, i, width, i);
	}
}

// 粒子系統
class P{
	constructor(x,y,c){
		this.pos = createVector(x,y);
		this.vel = p5.Vector.random2D().mult(random(1,6));
		this.life = 60;
		this.c = c;
	}
	update(){
		this.pos.add(this.vel);
		this.vel.mult(0.96);
		this.life -= 1;
	}
	draw(){
		noStroke();
		fill(red(this.c), green(this.c), blue(this.c), map(this.life,0,60,0,220));
		ellipse(this.pos.x, this.pos.y, map(this.life,0,60,0,10));
	}
	isDead(){
		return this.life <= 0;
	}
}

function createParticles(col){
	// 在畫布中央產生一組粒子
	let cx = width/2;
	let cy = height/2;
	for (let i=0;i<40;i++) particles.push(new P(cx + random(-40,40), cy + random(-40,40), col));
}

// 在按鈕位置產生短暫選取特效（頁面座標 -> canvas 座標）
function createSelectionEffectAt(pageX, pageY, col){
	const cEl = document.querySelector('canvas');
	const cRect = cEl ? cEl.getBoundingClientRect() : {left:0, top:0};
	let cx = pageX - cRect.left;
	let cy = pageY - cRect.top;
	for (let i=0;i<18;i++) selectionParticles.push(new P(cx + random(-8,8), cy + random(-8,8), col));
}

// 結束畫面動畫啟動
function startEndAnimation(mode){
	endParticles = [];
	if (mode === 'praise'){
		// fireworks-like
		for (let i=0;i<120;i++) endParticles.push(new P(random(width*0.2,width*0.8), random(height*0.2,height*0.6), color(random(50,255), random(50,255), random(50,255))));
	} else if (mode === 'encourage'){
		// 連續飄起的氣球
		for (let i=0;i<60;i++) endParticles.push(new P(random(80,width-80), height+random(0,200), color(random(120,255), random(80,200), random(120,255))));
	} else {
		// tryagain: 柔和上升粒子
		for (let i=0;i<50;i++) endParticles.push(new P(random(width*0.3,width*0.7), height+random(0,300), color(200,200,255)));
	}
}

function updateEndAnimation(){
	// 可以在此根據 endMode 做額外效果（例如顯示文字）
	push();
	textAlign(CENTER, CENTER);
	fill(255);
	textSize(28);
	if (endMode === 'praise'){
		text('太棒了！你表現很優秀 🎉', width/2, 40);
	} else if (endMode === 'encourage'){
		text('不錯喔，繼續加油 👍', width/2, 40);
	} else {
		text('別灰心，再試一次，你會進步的 ✨', width/2, 40);
	}
	pop();
}

// 自訂游標
function drawCustomCursor(){
	// draw a small trailing circle and glow
	noStroke();
	let mx = mouseX;
	let my = mouseY;
	fill(255,180);
	ellipse(mx, my, 22);
	fill(80,160,255,180);
	ellipse(mx, my, 8);
}

// 小工具
function min(a,b){ return a<b?a:b; }




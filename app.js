import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGA_AQUI") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("PEGA_AQUI");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = id => document.getElementById(id);
const audio = $("audio");
let tracks = [], currentIndex = -1, playlists = JSON.parse(localStorage.getItem("nova_playlists") || "[]");

function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2400)}
function time(s){if(!Number.isFinite(s))return "0:00";return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`}
function openModal(id){$(id).classList.add("open")}
function closeModal(id){$(id).classList.remove("open")}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$("adminOpen").onclick=()=>{openModal("adminModal");refreshSession()};
$("newPlaylist").onclick=()=>openModal("playlistModal");

function renderTracks(){
 const q=$("search").value.toLowerCase();
 const shown=tracks.filter(t=>(t.title+" "+(t.artist||"")).toLowerCase().includes(q));
 $("trackCount").textContent=tracks.length;
 $("trackGrid").innerHTML=shown.length?shown.map(t=>{
  const idx=tracks.indexOf(t), cover=t.cover_url?`background-image:url('${escapeAttr(t.cover_url)}')`:"";
  return `<article class="track-card"><div class="cover" style="${cover}"><span class="cover-symbol" ${t.cover_url?'style="display:none"':''}>♫</span><button class="card-play" data-play="${idx}">▶</button></div><div class="track-info"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.artist||"Artista independiente")}</span><div class="track-actions"><button data-play="${idx}">▶ Escuchar</button><a href="${escapeAttr(t.audio_url)}" download="${escapeAttr(t.title)}">↓ Descargar</a><button data-add="${idx}">＋ Playlist</button></div></div></article>`;
 }).join(""):`<div class="empty-state"><div class="empty-icon">♫</div><h3>${tracks.length?"No encontramos esa canción":"Tu escenario está listo"}</h3><p>${tracks.length?"Prueba con otro nombre o artista.":"Las canciones que publiques aparecerán aquí."}</p></div>`;
 document.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>playTrack(Number(b.dataset.play)));
 document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addTrackToPlaylist(Number(b.dataset.add)));
}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s=""){return escapeHtml(s)}
function playTrack(i){if(!tracks[i])return;currentIndex=i;const t=tracks[i];audio.src=t.audio_url;audio.play().catch(()=>toast("No se pudo reproducir el audio."));$("nowTitle").textContent=t.title;$("nowArtist").textContent=t.artist||"Artista independiente";$("nowCover").textContent="♫";$("nowCover").style.backgroundImage=t.cover_url?`url("${t.cover_url}")`:"";$("playBtn").textContent="Ⅱ"}
$("playBtn").onclick=()=>{if(!audio.src){if(tracks.length)playTrack(0);return}if(audio.paused){audio.play();$("playBtn").textContent="Ⅱ"}else{audio.pause();$("playBtn").textContent="▶"}};
$("prevBtn").onclick=()=>{if(tracks.length)playTrack((currentIndex-1+tracks.length)%tracks.length)};
$("nextBtn").onclick=()=>{if(tracks.length)playTrack((currentIndex+1)%tracks.length)};
audio.ontimeupdate=()=>{$("seek").value=audio.duration?audio.currentTime/audio.duration*100:0;$("currentTime").textContent=time(audio.currentTime);$("duration").textContent=time(audio.duration)};
$("seek").oninput=()=>{if(audio.duration)audio.currentTime=Number($("seek").value)/100*audio.duration};
$("volume").oninput=()=>audio.volume=Number($("volume").value);
audio.onended=()=>{if(tracks.length)playTrack((currentIndex+1)%tracks.length)};
$("search").oninput=renderTracks;

async function loadTracks(){
 if(!supabase){$("trackGrid").innerHTML='<div class="empty-state"><div class="empty-icon">⚙</div><h3>Falta conectar Supabase</h3><p>Abre README.txt y sigue los pasos para activar tu biblioteca musical.</p></div>';return}
 const {data,error}=await supabase.from("songs").select("*").order("created_at",{ascending:false});
 if(error){$("trackGrid").innerHTML=`<div class="empty-state"><h3>No se pudo cargar la biblioteca</h3><p>${escapeHtml(error.message)}</p></div>`;return}
 tracks=data||[];renderTracks();
}
async function refreshSession(){
 if(!supabase){$("adminMessage").textContent="Primero configura Supabase. Revisa README.txt.";return}
 const {data}=await supabase.auth.getSession();showSession(data.session);
}
function showSession(session){$("authForm").classList.toggle("hidden",!!session);$("uploadPanel").classList.toggle("hidden",!session);if(session)$("signedEmail").textContent=session.user.email}
$("loginBtn").onclick=async()=>{
 if(!supabase){$("adminMessage").textContent="Configura Supabase primero (README.txt).";return}
 $("adminMessage").textContent="Verificando...";
 const {data,error}=await supabase.auth.signInWithPassword({email:$("email").value,password:$("password").value});
 $("adminMessage").textContent=error?error.message:"Sesión iniciada.";
 if(data?.session)showSession(data.session);
};
$("logoutBtn").onclick=async()=>{await supabase.auth.signOut();showSession(null);toast("Sesión cerrada")};
$("uploadBtn").onclick=async()=>{
 const title=$("songTitle").value.trim(),artist=$("songArtist").value.trim(),file=$("songFile").files[0],cover=$("coverFile").files[0];
 if(!title||!file){$("adminMessage").textContent="Escribe el nombre y selecciona un audio.";return}
 if(file.size>100*1024*1024){$("adminMessage").textContent="El audio supera el límite de 100 MB.";return}
 $("uploadBtn").disabled=true;$("uploadBtn").textContent="Subiendo...";
 try{
  const user=(await supabase.auth.getUser()).data.user;
  if(!user)throw new Error("Inicia sesión de nuevo.");
  const clean=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),audioPath=`${user.id}/${Date.now()}-${clean}`;
  const up=await supabase.storage.from("music").upload(audioPath,file,{upsert:false,contentType:file.type||"audio/mpeg"});
  if(up.error)throw up.error;
  const audioUrl=supabase.storage.from("music").getPublicUrl(audioPath).data.publicUrl;
  let coverUrl=null,coverPath=null;
  if(cover){
   const cp=`${user.id}/${Date.now()}-${cover.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
   const cu=await supabase.storage.from("covers").upload(cp,cover,{upsert:false,contentType:cover.type});
   if(cu.error)throw cu.error;
   coverPath=cp;coverUrl=supabase.storage.from("covers").getPublicUrl(cp).data.publicUrl;
  }
  const ins=await supabase.from("songs").insert({title,artist,audio_url:audioUrl,audio_path:audioPath,cover_url:coverUrl,cover_path:coverPath,uploaded_by:user.id});
  if(ins.error)throw ins.error;
  $("songTitle").value="";$("songArtist").value="";$("songFile").value="";$("coverFile").value="";
  $("adminMessage").textContent="¡Canción publicada!";
  await loadTracks();toast("Tu canción ya está disponible");
 }catch(e){$("adminMessage").textContent=e.message||"Ocurrió un error al subir."}
 finally{$("uploadBtn").disabled=false;$("uploadBtn").innerHTML='Publicar canción <span>↑</span>'}
};

function savePlaylists(){localStorage.setItem("nova_playlists",JSON.stringify(playlists));renderPlaylists()}
function renderPlaylists(){
 $("playlistGrid").innerHTML=playlists.length?playlists.map((p,i)=>`<div class="playlist-card"><div class="playlist-art">♫</div><div style="min-width:0"><b>${escapeHtml(p.name)}</b><small>${p.songIds.length} canciones</small></div><button data-remove-playlist="${i}" title="Eliminar">×</button></div>`).join(""):'<p class="muted-text">Todavía no tienes playlists. Crea una para guardar tus favoritas.</p>';
 document.querySelectorAll("[data-remove-playlist]").forEach(b=>b.onclick=()=>{playlists.splice(Number(b.dataset.removePlaylist),1);savePlaylists()});
}
$("createPlaylist").onclick=()=>{const name=$("playlistName").value.trim();if(!name)return toast("Escribe un nombre");playlists.push({name,songIds:[]});$("playlistName").value="";savePlaylists();closeModal("playlistModal");toast("Playlist creada")};
function addTrackToPlaylist(i){
 if(!playlists.length){toast("Primero crea una playlist");openModal("playlistModal");return}
 const choices=playlists.map((p,n)=>`${n+1}. ${p.name}`).join("\n");
 const answer=prompt("¿A qué playlist la agregamos?\n"+choices+"\nEscribe el número:");
 const n=Number(answer)-1;if(Number.isInteger(n)&&playlists[n]){if(!playlists[n].songIds.includes(tracks[i].id))playlists[n].songIds.push(tracks[i].id);savePlaylists();toast("Agregada a "+playlists[n].name)}
}
renderPlaylists();loadTracks();
if(supabase)supabase.auth.onAuthStateChange((_event,session)=>showSession(session));

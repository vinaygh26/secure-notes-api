import React, { useEffect, useState } from 'react';
import API from '../api';

const Dashboard = () => {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");

  const fetchNotes = async () => {
    const res = await API.get('/notes');
    setNotes(res.data.notes || []);
  };

  const addNote = async () => {
    if (!newNote) return;
    await API.post('/notes', { content: newNote });
    setNewNote('');
    fetchNotes();
  };

  const deleteNote = async (id) => {
    await API.delete(`/notes/${id}`);
    fetchNotes();
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  return (
    <div>
      <h2>Your Notes</h2>
      <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="New note..." />
      <button onClick={addNote}>Add</button>

      <ul>
        {notes.map(note => (
          <li key={note.id}>
            {note.content}
            <button onClick={() => deleteNote(note.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Dashboard;

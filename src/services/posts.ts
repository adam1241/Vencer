import { supabase } from './supabase';
import { Post } from '../types/goal';

export const getPosts = async (): Promise<Post[]> => {
  const { data, error } = await supabase
    .from('posts')
    .select('id, user_id, content, points, streak, created_at, goal_title, profiles(full_name)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Posts fetch error', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    content: row.content,
    points: row.points,
    streak: row.streak,
    createdAt: row.created_at,
    goalTitle: row.goal_title,
    authorName: row.profiles?.full_name,
  }));
};

export const createPost = async (post: Omit<Post, 'id' | 'createdAt' | 'authorName'>) => {
  const { error } = await supabase.from('posts').insert({
    user_id: post.userId,
    content: post.content,
    points: post.points,
    streak: post.streak,
    goal_title: post.goalTitle,
  });

  if (error) {
    console.error('Post create error', error);
  }
};
